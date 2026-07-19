import { db } from './db.js';

export interface MessageEventRow {
  id: number;
  client_ref: string;
  from_status: string | null;
  to_status: string;
  provider: string | null;
  raw_status: string | null;
  detail: string | null;
  created_at: string;
}

const _listEventsStmt = db.prepare('SELECT * FROM message_events WHERE client_ref = ? ORDER BY id ASC');
export function listEvents(clientRef: string): MessageEventRow[] {
  return _listEventsStmt.all(clientRef) as MessageEventRow[];
}

const _insertWebhookEventStmt = db.prepare(`
  INSERT OR IGNORE INTO webhook_events (provider, provider_event_id, client_ref, received_at)
  VALUES (?, ?, ?, ?)
`);
export function recordWebhookEvent(provider: string, providerEventId: string, clientRef: string): boolean {
  const now = new Date().toISOString();
  const result = _insertWebhookEventStmt.run(provider, providerEventId, clientRef, now);
  return result.changes === 1;
}
