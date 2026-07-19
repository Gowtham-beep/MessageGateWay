CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_ref TEXT NOT NULL UNIQUE,
  sender_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  destination TEXT NOT NULL,
  text TEXT NOT NULL,
  route TEXT NOT NULL,
  provider TEXT,
  provider_message_id TEXT,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  failover_used INTEGER NOT NULL DEFAULT 0,
  send_claimed INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS message_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_ref TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  provider TEXT,
  raw_status TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_message_events_client_ref ON message_events(client_ref);

CREATE TABLE IF NOT EXISTS webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  client_ref TEXT NOT NULL,
  received_at TEXT NOT NULL,
  UNIQUE(provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_status_provider ON messages(status, provider);
