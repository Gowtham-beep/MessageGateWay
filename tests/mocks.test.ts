import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import { buildMockServer } from '../src/mocks/server.js';
import { FastifyInstance } from 'fastify';
import { env } from '../src/config/env.js';

describe('Mock Providers', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildMockServer();
    await app.listen({ port: 0 });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.inject({ method: 'POST', url: '/__control/reset' });
  });

  describe('Nexus Mock', () => {
    it('rejects a bad bearer token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/nexus/v1/send',
        headers: { authorization: 'Bearer bad-token' },
        payload: { client_ref: '1', to: '123', text: 'hi' }
      });
      expect(res.statusCode).toBe(401);
    });

    it('scripted rate_limit then ok returns 429 then 200', async () => {
      await app.inject({
        method: 'POST',
        url: '/__control/nexus/scenario',
        payload: { kinds: ['rate_limit', 'ok'] }
      });

      const res1 = await app.inject({
        method: 'POST',
        url: '/nexus/v1/send',
        headers: { authorization: `Bearer ${env.NEXUS_TOKEN}` },
        payload: { client_ref: '1', to: '123', text: 'hi' }
      });
      expect(res1.statusCode).toBe(429);
      expect(JSON.parse(res1.payload).error).toBe('rate_limited');
      
      const res2 = await app.inject({
        method: 'POST',
        url: '/nexus/v1/send',
        headers: { authorization: `Bearer ${env.NEXUS_TOKEN}` },
        payload: { client_ref: '1', to: '123', text: 'hi' }
      });
      expect(res2.statusCode).toBe(200);
      expect(JSON.parse(res2.payload)).toHaveProperty('provider_message_id');
    });
  });

  describe('Orbit Mock', () => {
    it('rejects a bad api key', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/orbit/messages',
        headers: { 'x-api-key': 'bad-key' },
        payload: { client_ref: '2', to: '123', text: 'hi' }
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 202 with an id for valid request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/orbit/messages',
        headers: { 'x-api-key': env.ORBIT_API_KEY },
        payload: { client_ref: '2', to: '123', text: 'hi' }
      });
      expect(res.statusCode).toBe(202);
      expect(JSON.parse(res.payload)).toHaveProperty('id');
    });

    it('status follows a scripted sequence across successive polls', async () => {
      const sendRes = await app.inject({
        method: 'POST',
        url: '/orbit/messages',
        headers: { 'x-api-key': env.ORBIT_API_KEY },
        payload: { client_ref: 'c_123', to: '123', text: 'hi' }
      });
      const id = JSON.parse(sendRes.payload).id;

      await app.inject({
        method: 'POST',
        url: '/__control/orbit/script',
        payload: { client_ref: 'c_123', statuses: ['queued', 'sending', 'rejected'] }
      });

      const p1 = await app.inject({ method: 'GET', url: `/orbit/messages/${id}/status` });
      expect(JSON.parse(p1.payload).state).toBe('queued');
      
      const p2 = await app.inject({ method: 'GET', url: `/orbit/messages/${id}/status` });
      expect(JSON.parse(p2.payload).state).toBe('sending');

      const p3 = await app.inject({ method: 'GET', url: `/orbit/messages/${id}/status` });
      expect(JSON.parse(p3.payload).state).toBe('rejected');
      
      const p4 = await app.inject({ method: 'GET', url: `/orbit/messages/${id}/status` });
      expect(JSON.parse(p4.payload).state).toBe('rejected');
    });
  });
});
