import fastify from 'fastify';
import { env } from './config/env.js';
import { messagesRoutes } from './api/messages.js';
import { webhookRoutes } from './api/webhooks.js';
import { dlrRoutes } from './api/dlr.js';

const app = fastify({ logger: true });

app.get('/health', async () => {
  return { ok: true };
});

app.register(messagesRoutes);
app.register(webhookRoutes);
app.register(dlrRoutes);

const start = async () => {
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`Server listening on port ${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
