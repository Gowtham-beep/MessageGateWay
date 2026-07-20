import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildTestEnv, postMessage } from './helpers/harness.js';
import { resetDb, db } from '../src/store/db.js';
import * as state from '../src/mocks/state.js';
import { resetMocks } from '../src/mocks/state.js';

describe('Routing', () => {
  let env: any;
  
  beforeAll(async () => { env = await buildTestEnv(); });
  afterAll(async () => {
    await env.app.close();
    await env.mocks.close();
  });
  beforeEach(() => {
    resetDb();
    resetMocks();
  });

  it('1. NEXUS01 routes to nexus', async () => {
    const res = await postMessage(env.app, { sender_id: 'NEXUS01' });
    expect(res.statusCode).toBe(202);
    expect(res.json().provider).toBe('nexus');
  });

  it('2. NEXUS02 routes to nexus', async () => {
    const res = await postMessage(env.app, { sender_id: 'NEXUS02' });
    expect(res.statusCode).toBe(202);
    expect(res.json().provider).toBe('nexus');
  });

  it('3. ORBIT01 routes to orbit, provider_message_id starts with ob_', async () => {
    const res = await postMessage(env.app, { sender_id: 'ORBIT01' });
    expect(res.statusCode).toBe(202);
    const json = res.json();
    expect(json.provider).toBe('orbit');
    expect(json.provider_message_id?.startsWith('ob_')).toBe(true);
  });

  it('4. AUTO01 with a healthy Nexus uses nexus and never touches orbit', async () => {
    const res = await postMessage(env.app, { sender_id: 'AUTO01' });
    expect(res.statusCode).toBe(202);
    expect(res.json().provider).toBe('nexus');
    expect(state.orbitMessages.size).toBe(0);
  });

  it('5. Unknown sender_id BOGUS9 -> 400, error code UNKNOWN_SENDER_ID, no row written', async () => {
    const res = await postMessage(env.app, { sender_id: 'BOGUS9' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('UNKNOWN_SENDER_ID');
    const count = db.prepare('SELECT COUNT(*) as c FROM messages').get() as any;
    expect(count.c).toBe(0);
  });
});
