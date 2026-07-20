import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildTestEnv, postMessage } from './helpers/harness.js';
import { resetDb, db } from '../src/store/db.js';
import * as state from '../src/mocks/state.js';
import { resetMocks, setOrbitScript } from '../src/mocks/state.js';

describe('Poller', () => {
  let env: any;
  beforeAll(async () => { env = await buildTestEnv(); });
  afterAll(async () => { await env.app.close(); await env.mocks.close(); });
  beforeEach(() => { resetDb(); resetMocks(); });

  it('29. ORBIT01 [queued,sending,delivered] walks SUBMITTED -> SENT -> DELIVERED', async () => {
    const res = await postMessage(env.app, { sender_id: 'ORBIT01' });
    const { client_ref } = res.json();
    setOrbitScript(client_ref, ['queued', 'sending', 'delivered']);
    
    const p1 = await env.app.inject({ method: 'POST', url: '/v1/dlr/poll' });
    expect(p1.json().results[0].status).toBe('SUBMITTED');
    
    const p2 = await env.app.inject({ method: 'POST', url: '/v1/dlr/poll' });
    expect(p2.json().results[0].status).toBe('SENT');
    
    const p3 = await env.app.inject({ method: 'POST', url: '/v1/dlr/poll' });
    expect(p3.json().results[0].status).toBe('DELIVERED');
  });

  it('30. Once DELIVERED, excluded from pending', async () => {
    const res = await postMessage(env.app, { sender_id: 'ORBIT01' });
    const { client_ref } = res.json();
    setOrbitScript(client_ref, ['delivered']);
    
    await env.app.inject({ method: 'POST', url: '/v1/dlr/poll' });
    
    const p2 = await env.app.inject({ method: 'POST', url: '/v1/dlr/poll' });
    expect(p2.json().polled).toBe(0);
  });

  it('31. rejected -> FAILED', async () => {
    const res = await postMessage(env.app, { sender_id: 'ORBIT01' });
    const { client_ref } = res.json();
    setOrbitScript(client_ref, ['rejected']);
    
    const p = await env.app.inject({ method: 'POST', url: '/v1/dlr/poll' });
    expect(p.json().results[0].status).toBe('FAILED');
  });

  it('32. Error in one does not abort batch', async () => {
    const r1 = await postMessage(env.app, { sender_id: 'ORBIT01' });
    const r2 = await postMessage(env.app, { sender_id: 'ORBIT01' });
    
    db.prepare("UPDATE messages SET provider_message_id = 'bogus' WHERE client_ref = ?").run(r1.json().client_ref);
    setOrbitScript(r2.json().client_ref, ['delivered']);
    
    const p = await env.app.inject({ method: 'POST', url: '/v1/dlr/poll' });
    const summary = p.json();
    expect(summary.errors).toBe(1);
    expect(summary.updated).toBe(1);
  });
});
