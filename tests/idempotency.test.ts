import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildTestEnv, postMessage } from './helpers/harness.js';
import { resetDb, db } from '../src/store/db.js';
import * as state from '../src/mocks/state.js';
import { resetMocks } from '../src/mocks/state.js';

describe('Idempotency', () => {
  let env: any;
  beforeAll(async () => { env = await buildTestEnv(); });
  afterAll(async () => { await env.app.close(); await env.mocks.close(); });
  beforeEach(() => { resetDb(); resetMocks(); });

  it('11. Same client_ref twice sequentially: second returns same provider_message_id and status; exactly ONE entry', async () => {
    const ref = 'ref-idem-1';
    const r1 = await postMessage(env.app, { client_ref: ref });
    expect(r1.statusCode).toBe(202);
    
    const r2 = await postMessage(env.app, { client_ref: ref });
    expect(r2.statusCode).toBe(200); // Idempotent OK
    
    expect(r1.json().provider_message_id).toBe(r2.json().provider_message_id);
    expect(r1.json().status).toBe(r2.json().status);
    expect(state.nexusMessages.size).toBe(1);
  });

  it('12. 10 concurrent identical POSTs: all report same provider_message_id; exactly one send; exactly one SUBMITTED transition', async () => {
    const ref = 'ref-idem-2';
    const promises = Array(10).fill(0).map(() => postMessage(env.app, { client_ref: ref }));
    const results = await Promise.all(promises);
    
    const successes = results.filter(r => r.statusCode === 202 || r.statusCode === 200);
    expect(successes.length).toBe(10);
    
    const ids = new Set(successes.map(r => r.json().provider_message_id));
    expect(ids.size).toBe(1);
    
    expect(state.nexusMessages.size).toBe(1);
    
    const events = db.prepare('SELECT * FROM message_events WHERE client_ref = ? AND to_status = ?').all(ref, 'SUBMITTED');
    expect(events.length).toBe(1);
  });

  it('13. Same client_ref with different destination -> 409 CLIENT_REF_CONFLICT', async () => {
    const ref = 'ref-idem-3';
    await postMessage(env.app, { client_ref: ref, destination: '+1111111111' });
    const r2 = await postMessage(env.app, { client_ref: ref, destination: '+2222222222' });
    
    expect(r2.statusCode).toBe(409);
    expect(r2.json().error.code).toBe('CLIENT_REF_CONFLICT');
  });
});
