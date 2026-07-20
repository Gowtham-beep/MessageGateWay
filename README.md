# Message Gateway

Message Gateway is a robust, idempotent HTTP service designed to orchestrate outbound messaging across multiple carrier providers. It abstracts the complexities of provider-specific delivery tracking, enforces strict monotonic state transitions, handles duplicate requests transparently via SQLite concurrency guards, and performs intelligent auto-failovers to ensure maximum delivery reliability.

## Tech Stack
**Stack:** Node.js, Fastify, TypeScript, SQLite (`better-sqlite3`), Vitest.
Node/TypeScript was chosen to maximize delivery speed within the strict deadline, though Python remains the preferred long-term language of choice.

## Setup & Execution

### 1. Installation
Install the required dependencies using npm:
```bash
npm install
```

### 2. Configuration
Copy `.env.example` to `.env` if you wish to override the defaults. The system is designed to work out of the box for testing and development.

| Variable | Default Value | Description |
|---|---|---|
| `PORT` | `3000` | Gateway API port |
| `PROVIDER_PORT` | `4000` | Mock provider API port |
| `NEXUS_TOKEN` | `mock_nexus` | Nexus API auth token |
| `ORBIT_API_KEY` | `mock_orbit` | Orbit API auth key |
| `NEXUS_WEBHOOK_SECRET` | `mock_secret` | Secret to sign webhooks |
| `DB_PATH` | `./data.sqlite` | SQLite database path |
| `GATEWAY_URL` | `http://localhost:3000` | URL for webhooks |
| `PROVIDER_BASE_URL` | `http://localhost:4000` | URL for outbound sends |
| `MOCK_TIMEOUT_MS` | `5000` | Sleep duration for simulated timeouts |
| `NEXUS_TIMEOUT_MS` | `2000` | Gateway outbound request timeout |
| `WEBHOOK_TOLERANCE_SEC` | `300` | Webhook timestamp tolerance (in seconds) |
| `POLL_INTERVAL_MS` | `0` | Background poller interval (0 = off) |
| `DISPATCH_WAIT_MS` | `2000` | Max wait time for concurrent dispatches (ms) |

### 3. Running the Gateway and Mocks
The system includes built-in mock providers for simulating carrier responses and failure modes. You should run both in separate terminal sessions.

**Start the Message Gateway:**
```bash
npm run dev
```

**Start the Mock Providers:**
```bash
npm run mocks
```

### 4. Running the Test Suite
The comprehensive test suite (which includes tests covering concurrency, idempotency, rate-limiting, polling, state validation, webhooks, and routing) is executed via Vitest. No external servers are required as the suite builds and manages its own isolated fastify/sqlite environment.
```bash
npm run test
```

## API Endpoints

### 1. `GET /health`
Returns a 200 OK indicating the server is running.

### 2. `POST /v1/messages`
Ingests a new message.
*   **Body**: `{"client_ref": "...", "sender_id": "...", "channel": "sms", "destination": "...", "text": "..."}`
*   **Response**: `202 Accepted` (Returns the current message state)

### 3. `GET /v1/messages/:clientRef`
Retrieves the message state and full audit trail (`events` array).

### 4. `POST /webhooks/nexus/status`
Receives delivery receipts from Nexus. Authenticated via `x-nexus-signature`.

### 5. `POST /v1/dlr/poll`
Manually triggers the background poller to fetch pending Orbit delivery receipts.

## Documentation
*   [docs/DESIGN.md](./docs/DESIGN.md): Details the core state machine, idempotency guarantees, failover rules, and testing strategies.
*   [docs/CURL.md](./docs/CURL.md): Provides copy-paste `curl` snippets to test integration across running servers.
