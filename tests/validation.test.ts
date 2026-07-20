import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildTestEnv, postMessage } from './helpers/harness.js';
import { resetDb } from '../src/store/db.js';
import { resetMocks } from '../src/mocks/state.js';

describe('Validation', () => {
  let env: any;
  beforeAll(async () => { env = await buildTestEnv(); });
  afterAll(async () => { await env.app.close(); await env.mocks.close(); });
  beforeEach(() => { resetDb(); resetMocks(); });

  it('6. Empty body -> 400', async () => {
    const res = await env.app.inject({ method: 'POST', url: '/v1/messages', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('7. destination 9876543210 (no +) -> 400 with field destination', async () => {
    const res = await postMessage(env.app, { destination: '9876543210' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.field).toBe('destination');
  });

  it('8. destination +0123456789 (leading zero) -> 400', async () => {
    const res = await postMessage(env.app, { destination: '+0123456789' });
    expect(res.statusCode).toBe(400);
  });

  it('9. Missing client_ref -> 400', async () => {
    const res = await env.app.inject({
      method: 'POST', url: '/v1/messages',
      payload: { sender_id: 'NEXUS01', destination: '+1234567890', text: 'hi', channel: 'sms' }
    });
    expect(res.statusCode).toBe(400);
  });

  it('10. channel whatsapp -> 400', async () => {
    const res = await postMessage(env.app, { channel: 'whatsapp' });
    expect(res.statusCode).toBe(400);
  });
});
