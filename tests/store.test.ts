import { describe, it, expect, beforeEach } from 'vitest';
import { env } from '../src/config/env.js';
import { db, resetDb } from '../src/store/db.js';
import { 
  insertIfAbsent, 
  claimForSend, 
  applyStatus, 
  getByClientRef,
  InsertMessageInput 
} from '../src/store/messages.js';
import { recordWebhookEvent, listEvents } from '../src/store/events.js';

// Setting memory DB specifically for tests (though test framework should handle env vars typically)
// the memory test can just use the resetDb helper to isolate state.

describe('Store Layer', () => {
  beforeEach(() => {
    resetDb();
  });

  const baseMsg: InsertMessageInput = {
    client_ref: 'ref-123',
    sender_id: 'NEXUS01',
    channel: 'sms',
    destination: '+1234567890',
    text: 'Hello',
    route: 'nexus'
  };

  it('duplicate insertIfAbsent returns created=false with the same row', () => {
    const r1 = insertIfAbsent(baseMsg);
    expect(r1.created).toBe(true);
    expect(r1.row.client_ref).toBe('ref-123');

    const r2 = insertIfAbsent(baseMsg);
    expect(r2.created).toBe(false);
    expect(r2.row.id).toBe(r1.row.id);
  });

  it('claimForSend succeeds once and fails the second time', () => {
    insertIfAbsent(baseMsg);
    const c1 = claimForSend('ref-123');
    expect(c1).toBe(true);
    const c2 = claimForSend('ref-123');
    expect(c2).toBe(false);
  });

  it('applyStatus refuses backward transitions', () => {
    insertIfAbsent(baseMsg);
    
    const r1 = applyStatus('ref-123', 'SENT', { provider: 'nexus' });
    expect(r1.applied).toBe(true);
    expect(r1.row.status).toBe('SENT');

    // Backward transition: SUBMITTED < SENT
    const r2 = applyStatus('ref-123', 'SUBMITTED');
    expect(r2.applied).toBe(false);
    expect(r2.row.status).toBe('SENT');
  });

  it('applyStatus refuses any transition out of DELIVERED (terminal state)', () => {
    insertIfAbsent(baseMsg);
    
    applyStatus('ref-123', 'DELIVERED');
    
    // Any status shouldn't apply
    const r1 = applyStatus('ref-123', 'FAILED');
    expect(r1.applied).toBe(false);
    expect(r1.row.status).toBe('DELIVERED');
  });

  it('applyStatus metadata update logic without status change', () => {
    insertIfAbsent(baseMsg);
    
    applyStatus('ref-123', 'SENT');
    const r1 = applyStatus('ref-123', 'SENT', { providerMessageId: 'msg-abc' });
    expect(r1.applied).toBe(true);
    expect(r1.row.provider_message_id).toBe('msg-abc');
    
    const events = listEvents('ref-123');
    // ACCEPTED -> SENT event only
    expect(events.length).toBe(1);
    expect(events[0].to_status).toBe('SENT');
  });

  it('recordWebhookEvent returns false on the second identical call', () => {
    const w1 = recordWebhookEvent('nexus', 'event-001', 'ref-123');
    expect(w1).toBe(true);
    
    const w2 = recordWebhookEvent('nexus', 'event-001', 'ref-123');
    expect(w2).toBe(false);
  });
});
