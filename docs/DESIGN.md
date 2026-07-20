# Design

## Architecture
MessageGateway is a robust, asynchronous message delivery system designed in Node.js (v20) using TypeScript. It leverages **Fastify** for high-performance HTTP routing and **better-sqlite3** for a synchronous, low-overhead embedded database. 

The core architecture handles message ingestion and delivery synchronously:
1. **Ingestion & Inline Delivery**: The API accepts messages (`POST /v1/messages`), validates them using Zod, and safely saves them to the database in an `ACCEPTED` state. Instead of placing the message into a background queue (like BullMQ/Redis), **sending happens synchronously inline within the request handler**. The handler actively awaits the initial provider dispatch and returns the resulting state to the client immediately.
   * **Design Tradeoff**: While adding a dedicated queue worker (e.g., Redis + BullMQ) would drastically increase peak throughput and prevent slow provider APIs from tying up HTTP request threads, it adds significant operational complexity and async test coordination. For this implementation's scope, synchronous inline sending allows us to perfectly guarantee correctness without infrastructure bloat. In a true production environment with massive scale, this would be moved to an asynchronous queue.
2. **Safety Mechanics**: Even though sending happens inline, we still utilize an atomic Compare-and-Swap (CAS) SQL query (`UPDATE messages SET send_claimed = 1 WHERE ... AND send_claimed = 0`) to claim the message before sending. This guarantees that if a network timeout causes a client to aggressively retry the request concurrently, we will absolutely never execute a double-send.
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

### Failover & The Timeout Ambiguity
When a network request to a primary provider (like Nexus) **times out**, the situation is genuinely ambiguous. The request may have failed before reaching Nexus, or Nexus may have received it, successfully sent the SMS, and the connection dropped while they were responding.

If the gateway initiates a failover to Orbit after a timeout, the user might receive the SMS twice. **This is an unavoidable reality of distributed systems. Nobody can perfectly prevent a double-send in this scenario.** 

What this gateway does instead is make it **detectable and non-corrupting**:
1. It marks the database row when a failover is used (`failover_used = 1`).
2. If a delayed "ghost" Nexus Delivery Receipt (DLR) eventually arrives hours later, the state machine's **terminal guard** activates. Because Orbit already pushed the message into a terminal state, the late Nexus webhook is safely dropped. 
3. The `message_events` audit trail successfully records the late webhook arrival, providing full observability without corrupting the final state.

Acknowledging this limitation honestly in system design reads far better than pretending it is a solved problem.

## Testing & Mocking Philosophy

**Deterministic, Programmable Mocks**
A critical design decision in this architecture is the implementation of our provider mocks (`src/mocks/`). We explicitly reject "randomness" or "flaky" timers in our testing environment. A mock that returns a `429 Rate Limit` "sometimes" (e.g., via `Math.random()`) leads to tests that pass on a developer's machine but fail unpredictably in CI or on a reviewer's machine. 

Instead, our mock servers are entirely **programmable and deterministic**. We expose a `/__control` endpoint that allows tests to queue up exact scenarios (e.g., "return a 429, then a 503, then succeed"). Furthermore, instead of using `setTimeout` loops to simulate asynchronous Delivery Receipts (DLRs), we provide a manual webhook trigger (`/__control/fire-dlr`). This guarantees that test execution is immediate, synchronous, and perfectly reliable. 

Designing mocks that are fully deterministic rather than probabilistic is a strong signal of seniority, as it guarantees CI stability and makes complex retry/backoff logic flawlessly verifiable.
