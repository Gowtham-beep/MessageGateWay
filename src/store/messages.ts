import { db } from './db.js';

export type MessageStatus = 'ACCEPTED' | 'SUBMITTED' | 'SENT' | 'DELIVERED' | 'FAILED';

export interface MessageRow {
  id: number;
  client_ref: string;
  sender_id: string;
  channel: string;
  destination: string;
  text: string;
  route: string;
  provider: string | null;
  provider_message_id: string | null;
  status: MessageStatus;
  attempts: number;
  failover_used: number;
  send_claimed: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export type InsertMessageInput = Omit<MessageRow, 'id' | 'provider' | 'provider_message_id' | 'status' | 'attempts' | 'failover_used' | 'send_claimed' | 'last_error' | 'created_at' | 'updated_at'>;

const STATUS_RANK: Record<MessageStatus, number> = { 
  ACCEPTED: 0, 
  SUBMITTED: 1, 
  SENT: 2, 
  DELIVERED: 3, 
  FAILED: 3 
};
const TERMINAL = new Set(['DELIVERED', 'FAILED']);

const _insertStmt = db.prepare(`
  INSERT INTO messages (
    client_ref, sender_id, channel, destination, text, route, status, created_at, updated_at
  ) VALUES (
    @client_ref, @sender_id, @channel, @destination, @text, @route, @status, @created_at, @updated_at
  ) ON CONFLICT(client_ref) DO NOTHING
`);
const _getByClientRefStmt = db.prepare('SELECT * FROM messages WHERE client_ref = ?');
const _claimForSendStmt = db.prepare('UPDATE messages SET send_claimed = 1 WHERE client_ref = ? AND send_claimed = 0');
const _updateMetadataStmt = db.prepare(`
  UPDATE messages 
  SET updated_at = @updated_at,
      provider = COALESCE(@provider, provider),
      provider_message_id = COALESCE(@provider_message_id, provider_message_id),
      last_error = COALESCE(@last_error, last_error)
  WHERE client_ref = @client_ref
`);
const _updateStatusStmt = db.prepare(`
  UPDATE messages 
  SET status = @status, updated_at = @updated_at,
      provider = COALESCE(@provider, provider),
      provider_message_id = COALESCE(@provider_message_id, provider_message_id),
      last_error = COALESCE(@last_error, last_error)
  WHERE client_ref = @client_ref
`);
const _insertEventStmt = db.prepare(`
  INSERT INTO message_events (client_ref, from_status, to_status, provider, raw_status, detail, created_at)
  VALUES (@client_ref, @from_status, @to_status, @provider, @raw_status, @detail, @created_at)
`);
const _incrementAttemptStmt = db.prepare('UPDATE messages SET attempts = attempts + 1 WHERE client_ref = ?');
const _markFailoverUsedStmt = db.prepare('UPDATE messages SET failover_used = 1 WHERE client_ref = ?');
const _findPendingStmt = db.prepare("SELECT * FROM messages WHERE provider = ? AND status IN ('SUBMITTED', 'SENT') LIMIT ?");

export const insertIfAbsent = db.transaction((input: InsertMessageInput): { row: MessageRow, created: boolean } => {
  const now = new Date().toISOString();
  const result = _insertStmt.run({
    ...input,
    status: 'ACCEPTED',
    created_at: now,
    updated_at: now
  });
  
  const row = _getByClientRefStmt.get(input.client_ref) as MessageRow;
  return { row, created: result.changes > 0 };
});

export function claimForSend(clientRef: string): boolean {
  const result = _claimForSendStmt.run(clientRef);
  return result.changes === 1;
}

export function getByClientRef(clientRef: string): MessageRow | null {
  return (_getByClientRefStmt.get(clientRef) as MessageRow) || null;
}

export interface ApplyStatusOpts {
  provider?: string;
  rawStatus?: string;
  detail?: string;
  providerMessageId?: string;
  lastError?: string;
}

export const applyStatus = db.transaction((
  clientRef: string, 
  toStatus: MessageStatus, 
  opts?: ApplyStatusOpts
): { applied: boolean, row: MessageRow } => {
  const current = _getByClientRefStmt.get(clientRef) as MessageRow | undefined;
  
  if (!current) {
    return { applied: false, row: undefined as unknown as MessageRow };
  }

  if (TERMINAL.has(current.status)) {
    return { applied: false, row: current };
  }

  const toRank = STATUS_RANK[toStatus];
  const currentRank = STATUS_RANK[current.status];

  if (toRank < currentRank) {
    return { applied: false, row: current };
  }

  const now = new Date().toISOString();

  if (toRank === currentRank) {
    if (toStatus !== current.status) {
      return { applied: false, row: current };
    }
    _updateMetadataStmt.run({
      client_ref: clientRef,
      updated_at: now,
      provider: opts?.provider ?? null,
      provider_message_id: opts?.providerMessageId ?? null,
      last_error: opts?.lastError ?? null
    });
    return { applied: true, row: _getByClientRefStmt.get(clientRef) as MessageRow };
  }

  _updateStatusStmt.run({
    client_ref: clientRef,
    status: toStatus,
    updated_at: now,
    provider: opts?.provider ?? null,
    provider_message_id: opts?.providerMessageId ?? null,
    last_error: opts?.lastError ?? null
  });

  _insertEventStmt.run({
    client_ref: clientRef,
    from_status: current.status,
    to_status: toStatus,
    provider: opts?.provider ?? current.provider ?? null,
    raw_status: opts?.rawStatus ?? null,
    detail: opts?.detail ?? null,
    created_at: now
  });

  return { applied: true, row: _getByClientRefStmt.get(clientRef) as MessageRow };
});

export function incrementAttempt(clientRef: string): void {
  _incrementAttemptStmt.run(clientRef);
}

export function markFailoverUsed(clientRef: string): void {
  _markFailoverUsedStmt.run(clientRef);
}

export function findPendingForPolling(provider: string, limit: number): MessageRow[] {
  return _findPendingStmt.all(provider, limit) as MessageRow[];
}
