import fastify from 'fastify';
import { env } from '../../src/config/env.js';

// Set up for testing
env.DB_PATH = ':memory:';

import { messagesRoutes } from '../../src/api/messages.js';
import { webhookRoutes } from '../../src/api/webhooks.js';
import { dlrRoutes } from '../../src/api/dlr.js';
import { resetDb } from '../../src/store/db.js';
import { buildMockServer } from '../../src/mocks/server.js';
import { resetMocks, state } from '../../src/mocks/state.js';

export async function buildTestEnv() {
  const mocks = buildMockServer();
  await mocks.listen({ port: 0, host: '127.0.0.1' });
  const providerAddress = mocks.server.address() as any;
  const providerUrl = `http://127.0.0.1:${providerAddress.port}`;
  
  env.PROVIDER_BASE_URL = providerUrl;
  env.NEXUS_TIMEOUT_MS = 5000;
  env.MOCK_TIMEOUT_MS = 6000;
  env.WEBHOOK_TOLERANCE_SEC = 300;

  const app = fastify();
  app.register(messagesRoutes);
  app.register(webhookRoutes);
  app.register(dlrRoutes);
  
  await app.listen({ port: 0, host: '127.0.0.1' });
  const appAddress = app.server.address() as any;
  const appUrl = `http://127.0.0.1:${appAddress.port}`;
  
  env.GATEWAY_URL = appUrl;

  return { app, mocks, urls: { provider: providerUrl, gateway: appUrl }, state };
}

export function postMessage(app: any, overrides: any = {}) {
  return app.inject({
    method: 'POST',
    url: '/v1/messages',
    payload: {
      client_ref: 'ref-' + Math.random().toString(36).slice(2, 10),
      sender_id: 'NEXUS01',
      destination: '+1234567890',
      text: 'test',
      channel: 'sms',
      ...overrides
    }
  });
}
