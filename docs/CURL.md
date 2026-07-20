# Verification Scenarios

This document contains actual output captured from running the Gateway and Mock servers. It demonstrates the core paths, failure modes, and resiliency mechanics.

## Prerequisites
Start both servers in separate terminal sessions before executing these commands:

```bash
# Terminal 1 - Gateway
npm run dev

# Terminal 2 - Mocks
npm run mocks
```

---

## HAPPY PATHS

### 1. Send via NEXUS01
Demonstrates a successful message ingestion to the Nexus provider.
```bash
curl -s -X POST http://localhost:3000/v1/messages -H "Content-Type: application/json" -d '{"client_ref":"curl-nex-1","sender_id":"NEXUS01","channel":"sms","destination":"+1234567890","text":"Hi"}'
```
**Response:**
```json
{"client_ref":"curl-nex-1","sender_id":"NEXUS01","destination":"+1234567890","status":"SUBMITTED","provider":"nexus","provider_message_id":"nx_1","attempts":1,"failover_used":0,"last_error":null,"created_at":"2026-07-20T04:48:29.892Z","updated_at":"2026-07-20T04:48:29.950Z"}
```

### 2. GET the lifecycle for that client_ref
Demonstrates fetching the message and its appended audit trail.
```bash
curl -s http://localhost:3000/v1/messages/curl-nex-1
```
**Response:**
```json
{"client_ref":"curl-nex-1","sender_id":"NEXUS01","destination":"+1234567890","status":"SUBMITTED","provider":"nexus","provider_message_id":"nx_1","attempts":1,"failover_used":0,"last_error":null,"created_at":"2026-07-20T04:48:29.892Z","updated_at":"2026-07-20T04:48:29.950Z","events":[{"id":1,"client_ref":"curl-nex-1","from_status":"ACCEPTED","to_status":"SUBMITTED","provider":"nexus","raw_status":"accepted","detail":null,"created_at":"2026-07-20T04:48:29.950Z"}]}
```

### 3. Fire a Nexus DLR via mock control -> GET
Demonstrates terminal Delivery Receipt processing via webhooks.
```bash
curl -s -X POST http://localhost:4000/nexus/__control/fire-dlr -H "Content-Type: application/json" -d '{"provider_message_id":"nx_1","status":"delivered"}'

curl -s http://localhost:3000/v1/messages/curl-nex-1
```
**Response:**
```json
{"gateway_status":200}

{"client_ref":"curl-nex-1","sender_id":"NEXUS01","destination":"+1234567890","status":"DELIVERED","provider":"nexus","provider_message_id":"nx_1","attempts":1,"failover_used":0,"last_error":null,"created_at":"2026-07-20T04:48:29.892Z","updated_at":"2026-07-20T04:48:30.025Z","events":[{"id":1,"client_ref":"curl-nex-1","from_status":"ACCEPTED","to_status":"SUBMITTED","provider":"nexus","raw_status":"accepted","detail":null,"created_at":"2026-07-20T04:48:29.950Z"},{"id":2,"client_ref":"curl-nex-1","from_status":"SUBMITTED","to_status":"DELIVERED","provider":"nexus","raw_status":"delivered","detail":null,"created_at":"2026-07-20T04:48:30.025Z"}]}
```

### 4. Send via ORBIT01
Demonstrates ingestion for the Orbit provider.
```bash
curl -s -X POST http://localhost:4000/__control/reset

curl -s -X POST http://localhost:3000/v1/messages -H "Content-Type: application/json" -d '{"client_ref":"curl-orb-1","sender_id":"ORBIT01","channel":"sms","destination":"+1234567890","text":"Hi"}'
```
**Response:**
```json
{"client_ref":"curl-orb-1","sender_id":"ORBIT01","destination":"+1234567890","status":"SUBMITTED","provider":"orbit","provider_message_id":"ob_1","attempts":1,"failover_used":0,"last_error":null,"created_at":"2026-07-20T04:48:30.050Z","updated_at":"2026-07-20T04:48:30.053Z"}
```

### 5. Three successive POST /v1/dlr/poll calls -> GET
Demonstrates the monotonic `SUBMITTED` -> `SENT` -> `DELIVERED` polling lifecycle.
```bash
curl -s -X POST http://localhost:3000/v1/dlr/poll
curl -s -X POST http://localhost:3000/v1/dlr/poll
curl -s -X POST http://localhost:3000/v1/dlr/poll

curl -s http://localhost:3000/v1/messages/curl-orb-1
```
**Response:**
```json
{"polled":1,"updated":1,"unchanged":0,"errors":0,"results":[{"client_ref":"curl-orb-1","raw_status":"queued","status":"SUBMITTED","applied":true}]}
{"polled":1,"updated":1,"unchanged":0,"errors":0,"results":[{"client_ref":"curl-orb-1","raw_status":"sending","status":"SENT","applied":true}]}
{"polled":1,"updated":1,"unchanged":0,"errors":0,"results":[{"client_ref":"curl-orb-1","raw_status":"delivered","status":"DELIVERED","applied":true}]}

{"client_ref":"curl-orb-1","sender_id":"ORBIT01","destination":"+1234567890","status":"DELIVERED","provider":"orbit","provider_message_id":"ob_1","attempts":1,"failover_used":0,"last_error":null,"created_at":"2026-07-20T04:48:30.050Z","updated_at":"2026-07-20T04:48:30.082Z","events":[{"id":3,"client_ref":"curl-orb-1","from_status":"ACCEPTED","to_status":"SUBMITTED","provider":"orbit","raw_status":"queued","detail":null,"created_at":"2026-07-20T04:48:30.053Z"},{"id":4,"client_ref":"curl-orb-1","from_status":"SUBMITTED","to_status":"SENT","provider":"orbit","raw_status":"sending","detail":null,"created_at":"2026-07-20T04:48:30.071Z"},{"id":5,"client_ref":"curl-orb-1","from_status":"SENT","to_status":"DELIVERED","provider":"orbit","raw_status":"delivered","detail":null,"created_at":"2026-07-20T04:48:30.082Z"}]}
```

---

## FAILURE PATHS

### 6. Unknown sender_id
Demonstrates rejection of unregistered senders at the API boundary.
```bash
curl -s -X POST http://localhost:4000/__control/reset

curl -s -X POST http://localhost:3000/v1/messages -H "Content-Type: application/json" -d '{"client_ref":"curl-err-1","sender_id":"BOGUS","channel":"sms","destination":"+1234567890","text":"Hi"}'
```
**Response:**
```json
{"error":{"code":"UNKNOWN_SENDER_ID","message":"Sender ID not configured"}}
```

### 7. Bad E.164 destination
Demonstrates input validation.
```bash
curl -s -X POST http://localhost:3000/v1/messages -H "Content-Type: application/json" -d '{"client_ref":"curl-err-2","sender_id":"NEXUS01","channel":"sms","destination":"123","text":"Hi"}'
```
**Response:**
```json
{"error":{"code":"VALIDATION_ERROR","message":"Invalid E.164 number","field":"destination"}}
```

### 8. Empty body
Demonstrates strict payload requirements.
```bash
curl -s -X POST http://localhost:3000/v1/messages -H "Content-Type: application/json" -d '{}'
```
**Response:**
```json
{"error":{"code":"VALIDATION_ERROR","message":"Empty body"}}
```

### 9. Same client_ref sent twice
Demonstrates exact idempotency without double-sends.
```bash
curl -s -X POST http://localhost:4000/__control/reset

curl -s -X POST http://localhost:3000/v1/messages -H "Content-Type: application/json" -d '{"client_ref":"curl-dup-1","sender_id":"NEXUS01","channel":"sms","destination":"+1234567890","text":"Hi"}'

curl -s -X POST http://localhost:3000/v1/messages -H "Content-Type: application/json" -d '{"client_ref":"curl-dup-1","sender_id":"NEXUS01","channel":"sms","destination":"+1234567890","text":"Hi"}'
```
**Response:**
```json
{"client_ref":"curl-dup-1","sender_id":"NEXUS01","destination":"+1234567890","status":"SUBMITTED","provider":"nexus","provider_message_id":"nx_1","attempts":1,"failover_used":0,"last_error":null,"created_at":"2026-07-20T04:48:30.140Z","updated_at":"2026-07-20T04:48:30.143Z"}

{"client_ref":"curl-dup-1","sender_id":"NEXUS01","destination":"+1234567890","status":"SUBMITTED","provider":"nexus","provider_message_id":"nx_1","attempts":1,"failover_used":0,"last_error":null,"created_at":"2026-07-20T04:48:30.140Z","updated_at":"2026-07-20T04:48:30.143Z"}
```

### 10. Same client_ref with a different destination
Demonstrates conflict rejection on differing payload signatures.
```bash
curl -s -X POST http://localhost:3000/v1/messages -H "Content-Type: application/json" -d '{"client_ref":"curl-dup-1","sender_id":"NEXUS01","channel":"sms","destination":"+1999999999","text":"Hi"}'
```
**Response:**
```json
{"error":{"code":"CLIENT_REF_CONFLICT","message":"Payload differs"}}
```

### 11. Script nexus rate_limit x2 then ok -> GET
Demonstrates 429 exponential backoff retries.
```bash
curl -s -X POST http://localhost:4000/__control/reset
curl -s -X POST http://localhost:4000/__control/nexus/scenario -H "Content-Type: application/json" -d '{"kinds":["rate_limit","rate_limit","ok"]}'

curl -s -X POST http://localhost:3000/v1/messages -H "Content-Type: application/json" -d '{"client_ref":"curl-rl-1","sender_id":"NEXUS01","channel":"sms","destination":"+1234567890","text":"Hi"}'

curl -s http://localhost:3000/v1/messages/curl-rl-1
```
**Response:**
```json
{"ok":true}

{"client_ref":"curl-rl-1","sender_id":"NEXUS01","destination":"+1234567890","status":"SUBMITTED","provider":"nexus","provider_message_id":"nx_1","attempts":3,"failover_used":0,"last_error":null,"created_at":"2026-07-20T04:48:30.176Z","updated_at":"2026-07-20T04:48:30.394Z"}

{"client_ref":"curl-rl-1","sender_id":"NEXUS01","destination":"+1234567890","status":"SUBMITTED","provider":"nexus","provider_message_id":"nx_1","attempts":3,"failover_used":0,"last_error":null,"created_at":"2026-07-20T04:48:30.176Z","updated_at":"2026-07-20T04:48:30.394Z","events":[{"id":7,"client_ref":"curl-rl-1","from_status":"ACCEPTED","to_status":"SUBMITTED","provider":"nexus","raw_status":"accepted","detail":null,"created_at":"2026-07-20T04:48:30.394Z"}]}
```

### 12. Script nexus server_error, send via AUTO01 -> GET
Demonstrates fallback to Orbit and audit trail logging.
```bash
curl -s -X POST http://localhost:4000/__control/reset
curl -s -X POST http://localhost:4000/__control/nexus/scenario -H "Content-Type: application/json" -d '{"kinds":["server_error"]}'

curl -s -X POST http://localhost:3000/v1/messages -H "Content-Type: application/json" -d '{"client_ref":"curl-auto-1","sender_id":"AUTO01","channel":"sms","destination":"+1234567890","text":"Hi"}'

curl -s http://localhost:3000/v1/messages/curl-auto-1
```
**Response:**
```json
{"ok":true}

{"client_ref":"curl-auto-1","sender_id":"AUTO01","destination":"+1234567890","status":"SUBMITTED","provider":"orbit","provider_message_id":"ob_1","attempts":2,"failover_used":1,"last_error":null,"created_at":"2026-07-20T04:48:30.453Z","updated_at":"2026-07-20T04:48:30.459Z"}

{"client_ref":"curl-auto-1","sender_id":"AUTO01","destination":"+1234567890","status":"SUBMITTED","provider":"orbit","provider_message_id":"ob_1","attempts":2,"failover_used":1,"last_error":null,"created_at":"2026-07-20T04:48:30.453Z","updated_at":"2026-07-20T04:48:30.459Z","events":[{"id":8,"client_ref":"curl-auto-1","from_status":"ACCEPTED","to_status":"ACCEPTED","provider":"nexus","raw_status":null,"detail":"failover: nexus server_error -> orbit","created_at":"2026-07-20T04:48:30.456Z"},{"id":9,"client_ref":"curl-auto-1","from_status":"ACCEPTED","to_status":"SUBMITTED","provider":"orbit","raw_status":"queued","detail":null,"created_at":"2026-07-20T04:48:30.459Z"}]}
```

### 13. Fire the identical Nexus DLR twice
Demonstrates webhook deduplication.
```bash
curl -s -X POST http://localhost:4000/__control/reset
curl -s -X POST http://localhost:3000/v1/messages -H "Content-Type: application/json" -d '{"client_ref":"curl-dlr-1","sender_id":"NEXUS01","channel":"sms","destination":"+1234567890","text":"Hi"}'

curl -s -X POST http://localhost:4000/nexus/__control/fire-dlr -H "Content-Type: application/json" -d '{"provider_message_id":"nx_1","status":"delivered"}'

curl -s -X POST http://localhost:4000/nexus/__control/fire-dlr -H "Content-Type: application/json" -d '{"provider_message_id":"nx_1","status":"delivered"}'
```
**Response:**
```json
{"client_ref":"curl-dlr-1","sender_id":"NEXUS01","destination":"+1234567890","status":"SUBMITTED","provider":"nexus","provider_message_id":"nx_1","attempts":1,"failover_used":0,"last_error":null,"created_at":"2026-07-20T04:48:30.480Z","updated_at":"2026-07-20T04:48:30.482Z"}

{"gateway_status":200}
{"gateway_status":200}
```

### 14a. Missing signature
Demonstrates webhook endpoint protecting against unsigned payloads.
```bash
curl -s -X POST http://localhost:3000/webhooks/nexus/status -H "Content-Type: application/json" -d '{"event_id":"evt_1","provider_message_id":"nx_1","client_ref":"curl-sig-1","status":"delivered"}'
```
**Response:**
```json
{"error":{"code":"MISSING_SIGNATURE"}}
```

### 14b. Tampered body
Demonstrates webhook signature verification failing on a corrupted signature.
```bash
# Simulating a manually tampered request using a legitimate timestamp
curl -s -X POST http://localhost:3000/webhooks/nexus/status -H "Content-Type: application/json" -H "x-nexus-timestamp: 1721450910547" -H "x-nexus-signature: bogus_signature" -d '{"event_id":"nx_1:delivered","provider_message_id":"nx_1","client_ref":"curl-sig-1","status":"delivered","timestamp":"1721450910547"}'
```
**Response:**
```json
{"error":{"code":"INVALID_SIGNATURE"}}
```
