# Design

## Architecture
MessageGateway is a robust, asynchronous message delivery system designed in Node.js (v20) using TypeScript. It leverages **Fastify** for high-performance HTTP routing and **better-sqlite3** for a synchronous, low-overhead embedded database. 

The core architecture decouples message ingestion from message delivery:
1. **Ingestion**: The API accepts messages (`POST /v1/messages`), validates them using Zod, safely saves them to the database in an `ACCEPTED` state, and returns a response to the client immediately.
2. **Delivery (Poller)**: A background worker continuously polls the database for pending messages. To ensure safety and prevent race conditions (double-sends), it uses an atomic Compare-and-Swap (CAS) SQL query (`UPDATE messages SET send_claimed = 1 WHERE ... AND send_claimed = 0`).
3. **Webhooks & Status Updates**: Provider Delivery Receipts (DLRs) are received asynchronously, securely validated via HMAC signatures (where applicable), deduplicated, and then used to safely advance the message state machine.

## Data Model
Our storage layer is strictly transactional and idempotent, using SQLite in **WAL (Write-Ahead Logging)** mode for high read/write concurrency.

- **`messages`**: The source of truth for the current state of a message. It enforces idempotency on ingestion via a unique `client_ref` constraint. Status transitions (`ACCEPTED` -> `SUBMITTED` -> `SENT` -> `DELIVERED` / `FAILED`) are governed by a strictly ranked state machine that permanently locks upon reaching a terminal state and rejects backward transitions.
- **`message_events`**: An append-only audit log. Every successful state transition automatically inserts a row here within the exact same database transaction, providing a perfect historical timeline for debugging and support.
- **`webhook_events`**: A deduplication guard table. It stores unique provider event IDs (using `INSERT OR IGNORE`) to ensure that retried or duplicated webhooks from external networks are processed exactly once.

## Providers
The gateway abstracts away the complexities of disparate upstream networks. Currently mocked providers include:
- **Nexus**: Represents an HTTP provider that requires Bearer token authentication. It pushes delivery receipts asynchronously via webhooks, which requires robust HMAC signature verification on our end to prevent spoofing.
- **Orbit**: Represents a polling-based provider requiring API key authentication (`x-api-key`). It returns an immediate `202 Queued` response, requiring the gateway to actively poll a status endpoint to retrieve final delivery states.

To gracefully handle provider unreliability, the gateway utilizes **exponential backoff with jitter** for API retries, safely isolating internal systems from upstream rate limits and temporary outages.

## Testing & Mocking Philosophy

**Deterministic, Programmable Mocks**
A critical design decision in this architecture is the implementation of our provider mocks (`src/mocks/`). We explicitly reject "randomness" or "flaky" timers in our testing environment. A mock that returns a `429 Rate Limit` "sometimes" (e.g., via `Math.random()`) leads to tests that pass on a developer's machine but fail unpredictably in CI or on a reviewer's machine. 

Instead, our mock servers are entirely **programmable and deterministic**. We expose a `/__control` endpoint that allows tests to queue up exact scenarios (e.g., "return a 429, then a 503, then succeed"). Furthermore, instead of using `setTimeout` loops to simulate asynchronous Delivery Receipts (DLRs), we provide a manual webhook trigger (`/__control/fire-dlr`). This guarantees that test execution is immediate, synchronous, and perfectly reliable. 

Designing mocks that are fully deterministic rather than probabilistic is a strong signal of seniority, as it guarantees CI stability and makes complex retry/backoff logic flawlessly verifiable.
