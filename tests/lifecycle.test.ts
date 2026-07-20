import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildTestEnv, postMessage } from './helpers/harness.js';
import { resetDb } from '../src/store/db.js';
import * as state from '../src/mocks/state.js';
import { resetMocks, setOrbitScript } from '../src/mocks/state.js';

describe('Lifecycle API', () => {
  let env: any;
  beforeAll(async () => { env = await buildTestEnv(); });
  afterAll(async () => { await env.app.close(); await env.mocks.close(); });
  beforeEach(() => { resetDb(); resetMocks(); });

  it('33. GET /v1/messages/:client_ref returns full audit trail', async () => {
    const res = await postMessage(env.app, { sender_id: 'ORBIT01' });
    const client_ref = res.json().client_ref;
    
    setOrbitScript(client_ref, ['sending', 'delivered']);
    await env.app.inject({ method: 'POST', url: '/v1/dlr/poll' });
    await env.app.inject({ method: 'POST', url: '/v1/dlr/poll' });
    
    const getRes = await env.app.inject({ method: 'GET', url: `/v1/messages/${client_ref}` });
    expect(getRes.statusCode).toBe(200);
    
    const data = getRes.json();
    expect(data.status).toBe('DELIVERED');
    expect(data.events.length).toBeGreaterThanOrEqual(3);
    
    expect(data.events[0].from_status).toBe('ACCEPTED');
    expect(data.events[0].to_status).toBe('SUBMITTED');
    
    expect(data.events[1].from_status).toBe('SUBMITTED');
    expect(data.events[1].to_status).toBe('SENT');
    
    expect(data.events[2].from_status).toBe('SENT');
    expect(data.events[2].to_status).toBe('DELIVERED');
  });

  it('34. GET for unknown -> 404', async () => {
    const getRes = await env.app.inject({ method: 'GET', url: '/v1/messages/bogus_ref' });
    expect(getRes.statusCode).toBe(404);
  });
});
