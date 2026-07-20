import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildTestEnv, postMessage } from './helpers/harness.js';
import { resetDb, db } from '../src/store/db.js';
import { resetMocks } from '../src/mocks/state.js';
import crypto from 'crypto';
import { env as realEnv } from '../src/config/env.js';
import { getByClientRef } from '../src/store/messages.js';

describe('Webhooks', () => {
  let env: any;
  beforeAll(async () => { env = await buildTestEnv(); });
  afterAll(async () => { await env.app.close(); await env.mocks.close(); });
  beforeEach(() => { resetDb(); resetMocks(); });

  async function fireWebhook(payload: any, secret = realEnv.NEXUS_WEBHOOK_SECRET, timestamp = Date.now(), missingSig = false) {
    const rawBody = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const headers: any = {
      'content-type': 'application/json',
      'x-nexus-timestamp': timestamp.toString(),
    };
    if (!missingSig) headers['x-nexus-signature'] = signature;

    return env.app.inject({
      method: 'POST',
      url: '/webhooks/nexus/status',
      headers,
      payload: rawBody
    });
  }

  it('23. Valid signed DLR delivered -> DELIVERED, event row recorded', async () => {
    const res = await postMessage(env.app, { sender_id: 'NEXUS01' });
    const { client_ref, provider_message_id } = res.json();
    expect(provider_message_id).toBeTruthy();
    
    const hookRes = await fireWebhook({
      event_id: 'evt_1', provider_message_id, client_ref, status: 'delivered', timestamp: Date.now()
    });
    expect(hookRes.statusCode).toBe(200);
    expect(hookRes.json().applied).toBe(true);
    
    const row = db.prepare('SELECT status FROM messages WHERE client_ref = ?').get(client_ref) as any;
    expect(row.status).toBe('DELIVERED');
    
    const events = db.prepare('SELECT raw_status FROM message_events WHERE client_ref = ? AND to_status = ?').all(client_ref, 'DELIVERED') as any[];
    expect(events.length).toBe(1);
    expect(events[0].raw_status).toBe('delivered');
  });

  it('24. Exact same DLR twice -> 200, second reports duplicate:true, no second event', async () => {
    const res = await postMessage(env.app, { sender_id: 'NEXUS01' });
    const { client_ref, provider_message_id } = res.json();
    const payload = { event_id: 'evt_2', provider_message_id, client_ref, status: 'delivered', timestamp: Date.now() };
    
    const r1 = await fireWebhook(payload);
    const r2 = await fireWebhook(payload);
    
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    expect(r2.json().duplicate).toBe(true);
    
    const events = db.prepare('SELECT * FROM message_events WHERE client_ref = ? AND to_status = ?').all(client_ref, 'DELIVERED');
    expect(events.length).toBe(1);
  });

  it('25. Tampered body with stale signature -> 401 INVALID_SIGNATURE', async () => {
    const payload = { event_id: 'evt_3', provider_message_id: 'p_1', client_ref: 'c_1', status: 'delivered', timestamp: Date.now() };
    const rawBody = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', realEnv.NEXUS_WEBHOOK_SECRET).update(rawBody).digest('hex');
    
    const tamperedBody = JSON.stringify({ ...payload, status: 'failed' });
    
    const r = await env.app.inject({
      method: 'POST', url: '/webhooks/nexus/status',
      headers: { 'content-type': 'application/json', 'x-nexus-timestamp': Date.now().toString(), 'x-nexus-signature': signature },
      payload: tamperedBody
    });
    
    expect(r.statusCode).toBe(401);
    expect(r.json().error.code).toBe('INVALID_SIGNATURE');
  });

  it('26. Missing signature header -> 401', async () => {
    const r = await fireWebhook({}, realEnv.NEXUS_WEBHOOK_SECRET, Date.now(), true);
    expect(r.statusCode).toBe(401);
    expect(r.json().error.code).toBe('MISSING_SIGNATURE');
  });

  it('27. Out-of-order DLR -> stays DELIVERED', async () => {
    const res = await postMessage(env.app, { sender_id: 'NEXUS01' });
    const { client_ref, provider_message_id } = res.json();
    
    await fireWebhook({ event_id: 'evt_4', provider_message_id, client_ref, status: 'delivered', timestamp: Date.now() });
    const hookRes = await fireWebhook({ event_id: 'evt_5', provider_message_id, client_ref, status: 'sent', timestamp: Date.now() });
    
    expect(hookRes.json().applied).toBe(false);
    const row = db.prepare('SELECT status FROM messages WHERE client_ref = ?').get(client_ref) as any;
    expect(row.status).toBe('DELIVERED');
  });

  it('28. Unknown client_ref -> 200 ignored', async () => {
    const r = await fireWebhook({ event_id: 'evt_6', provider_message_id: 'p', client_ref: 'unknown', status: 'delivered', timestamp: Date.now() });
    expect(r.statusCode).toBe(200);
    expect(r.json().ignored).toBe('unknown_client_ref');
  });

  it('29. Fire a valid delivered DLR, then fire a valid undelivered DLR with DIFFERENT event_id -> 200, stays DELIVERED, no FAILED event', async () => {
    const res = await postMessage(env.app, { sender_id: 'NEXUS01' });
    const { client_ref, provider_message_id } = res.json();
    
    await fireWebhook({ event_id: 'evt_d1', provider_message_id, client_ref, status: 'delivered', timestamp: Date.now() });
    expect(getByClientRef(client_ref)!.status).toBe('DELIVERED');
    
    const r2 = await fireWebhook({ event_id: 'evt_d2', provider_message_id, client_ref, status: 'undelivered', timestamp: Date.now() });
    expect(r2.statusCode).toBe(200);
    expect(getByClientRef(client_ref)!.status).toBe('DELIVERED');
    
    const fails = db.prepare("SELECT * FROM message_events WHERE client_ref = ? AND to_status = 'FAILED'").all(client_ref);
    expect(fails.length).toBe(0);
  });
});
