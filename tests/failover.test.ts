import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildTestEnv, postMessage } from './helpers/harness.js';
import { resetDb } from '../src/store/db.js';
import * as state from '../src/mocks/state.js';
import { resetMocks, pushNexusScenario, pushOrbitScenario } from '../src/mocks/state.js';
import { env as realEnv } from '../src/config/env.js';

describe('Failover', () => {
  let env: any;
  beforeAll(async () => { env = await buildTestEnv(); });
  afterAll(async () => { await env.app.close(); await env.mocks.close(); });
  beforeEach(() => { resetDb(); resetMocks(); });

  it('17. AUTO01 + nexus server_error: falls over to orbit, failover_used=1', async () => {
    pushNexusScenario('server_error');
    const res = await postMessage(env.app, { sender_id: 'AUTO01' });
    const json = res.json();
    expect(json.provider).toBe('orbit');
    expect(json.failover_used).toBe(1);
    expect(state.nexusMessages.size).toBe(0);
    expect(state.orbitMessages.size).toBe(1);
  });

  it('18. AUTO01 + nexus timeout: falls over to orbit', async () => {
    pushNexusScenario('timeout');
    const res = await postMessage(env.app, { sender_id: 'AUTO01' });
    const json = res.json();
    expect(json.provider).toBe('orbit');
    expect(json.failover_used).toBe(1);
    expect(state.orbitMessages.size).toBe(1);
  });

  it('19. AUTO01 + both failing: status FAILED, last_error set, exactly one orbit attempt', async () => {
    pushNexusScenario('server_error');
    pushOrbitScenario('server_error');
    const res = await postMessage(env.app, { sender_id: 'AUTO01' });
    
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('FAILED');
    expect(res.json().last_error).toContain('error');
    expect(state.orbitMessages.size).toBe(0); // Failed ingestion
  });

  it('20. NEXUS01 + server_error: status FAILED, NO failover', async () => {
    pushNexusScenario('server_error');
    const res = await postMessage(env.app, { sender_id: 'NEXUS01' });
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('FAILED');
    expect(res.json().provider).toBe('nexus');
    expect(res.json().failover_used).toBe(0);
    expect(state.orbitMessages.size).toBe(0);
  });

  it('21. AUTO01 + nexus rate_limit x3: status FAILED, orbitMessages empty', async () => {
    pushNexusScenario(['rate_limit', 'rate_limit', 'rate_limit']);
    const res = await postMessage(env.app, { sender_id: 'AUTO01' });
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('FAILED');
    expect(res.json().failover_used).toBe(0);
    expect(state.orbitMessages.size).toBe(0);
  });

  it('22. Failover sends exactly once', async () => {
    pushNexusScenario('server_error');
    const res = await postMessage(env.app, { sender_id: 'AUTO01' });
    expect(res.json().failover_used).toBe(1);
    expect(state.nexusMessages.size + state.orbitMessages.size).toBe(1);
  });

  it('23. AUTO01 failover produces an event row and matches response shapes', async () => {
    pushNexusScenario('server_error');
    const postRes = await postMessage(env.app, { sender_id: 'AUTO01' });
    const postJson = postRes.json();
    
    expect(postJson).not.toHaveProperty('id');
    expect(postJson).not.toHaveProperty('send_claimed');
    
    const clientRef = postJson.client_ref;
    const getRes = await env.app.inject({ method: 'GET', url: `/v1/messages/${clientRef}` });
    const getJson = getRes.json();
    
    expect(getJson).not.toHaveProperty('id');
    expect(getJson).not.toHaveProperty('send_claimed');
    
    const postKeys = Object.keys(postJson).sort();
    const getKeys = Object.keys(getJson).filter(k => k !== 'events').sort();
    expect(postKeys).toEqual(getKeys);

    const failoverEvent = getJson.events.find((e: any) => e.detail && e.detail.includes('failover'));
    expect(failoverEvent).toBeDefined();
    expect(failoverEvent.provider).toBe('nexus');
    expect(failoverEvent.from_status).toBe('ACCEPTED');
    expect(failoverEvent.to_status).toBe('ACCEPTED');
  });
});
