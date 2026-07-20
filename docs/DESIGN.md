# Message Gateway Design

## 1. Routing Table
Sender IDs strictly map to providers, authentication mechanisms, and delivery tracking modes via `config/senders.ts`. Unknown Sender IDs are rejected at the API boundary.
*   **NEXUS01 / NEXUS02**: `nexus` provider -> Token Auth -> Webhooks
*   **ORBIT01**: `orbit` provider -> API Key Auth -> Polling
*   **AUTO01**: `auto` route -> `nexus` primary, `orbit` fallback -> Token Auth -> Webhooks/Polling

## 2. State Machine
Messages follow a monotonic lifecycle: `ACCEPTED (0) -> SUBMITTED (1) -> SENT (2) -> DELIVERED (3) | FAILED (3)`.
*   **Rules**: Transitions only progress forward or to the same rank if the status string matches. `DELIVERED` and `FAILED` are strictly terminal. Every applied transition appends an immutable row to `message_events`.
*   **Nexus Mapping**: `accepted` -> `SUBMITTED`, `sent` -> `SENT`, `delivered` -> `DELIVERED`, `undelivered` / `expired` -> `FAILED`.
*   **Orbit Mapping**: `queued` -> `SUBMITTED`, `sending` -> `SENT`, `delivered` -> `DELIVERED`, `failed` / `rejected` -> `FAILED`.
*   Unknown raw provider statuses are explicitly logged and ignored. We never guess state.

## 3. Idempotency and Single-Send
*   **Ingestion**: `UNIQUE(client_ref)` enforced by SQLite `INSERT ON CONFLICT DO NOTHING`. If a duplicate request provides a conflicting payload, a `409` is returned.
*   **Dispatch**: A Compare-And-Swap (CAS) on `send_claimed` ensures exactly one concurrent caller executes the downstream provider request. Duplicate callers enter a wait loop (capped at `DISPATCH_WAIT_MS`) and return the current state safely.
*   **Webhooks**: Deduplication is guaranteed by a `UNIQUE(provider, provider_event_id)` constraint in the `events` table. Duplicates silently return HTTP `200` to satisfy the provider without re-applying state.

## 4. Retries and Failover
*   **Retries**: HTTP `429 Rate Limited` triggers up to 3 attempts on the *same* provider using exponential backoff with full jitter. Rate limiting is *never* a failover trigger.
*   **Failover**: HTTP 5xx or Timeouts are strictly not retried on the same provider. For the `AUTO01` sender only, this triggers a single fallback send to Orbit, guarded by `failover_used = 1`. `NEXUS01` and `NEXUS02` never fail over.
*   **Audit**: Failovers are explicitly recorded in `message_events` (e.g., `detail: "failover: nexus server_error -> orbit"`), ensuring the primary failure is visible in the audit trail without breaking the monotonic state sequence.

## 5. Known Limitations
*   **Ambiguous Timeouts**: A Nexus timeout is ambiguous—the downstream send may have successfully reached the carrier. Consequently, failing over to Orbit cannot mathematically guarantee the prevention of a duplicate SMS to the end user. A late Nexus DLR arriving for a message already marked terminal (via the Orbit failover) is safely dropped by the terminal guard and visible in the audit trail.
*   **Inline Dispatch**: Outbound sending is performed synchronously inline with the HTTP request. A robust queue/worker architecture would be the proper production choice to decouple ingestion from outbound latency.
*   **Scaling Limit**: Single-node SQLite correctly enforces the CAS claim across multi-process deployments sharing the same block storage, but throughput is ultimately bounded by file locks.

## 6. Testing
A strict mutation testing strategy was used to verify architectural invariants:
*   **Claim CAS Removed**: Instantly caught by the "true race on claim" concurrency test, which enforces a barrier to prove duplicate downstream requests are impossible.
*   **Webhook Deduplication Removed**: Caught by the "duplicate event_id returns 200 without double-applying" webhook test.
*   **Terminal Check Removed**: Terminal protection is intentionally redundant (explicit `TERMINAL` set guard plus monotonic rank ordering). Removing either alone preserves the invariant; both must be stripped before the mutation test fails.
