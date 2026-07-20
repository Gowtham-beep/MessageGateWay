import fastify from 'fastify';
import { env } from './config/env.js';
import { messagesRoutes } from './api/messages.js';
import { webhookRoutes } from './api/webhooks.js';
import { dlrRoutes } from './api/dlr.js';
import { pollPending } from './poller/index.js';

const app = fastify({ logger: true });

app.get('/health', async () => {
  return { ok: true };
});

app.register(messagesRoutes);
app.register(webhookRoutes);
app.register(dlrRoutes);

let pollerInterval: NodeJS.Timeout | null = null;
let isPolling = false;

const start = async () => {
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`Server listening on port ${env.PORT}`);

    if (env.POLL_INTERVAL_MS > 0) {
      app.log.info(`Background poller enabled with interval ${env.POLL_INTERVAL_MS}ms`);
      pollerInterval = setInterval(async () => {
        if (isPolling) return;
        isPolling = true;
        try {
          await pollPending();
        } catch (err) {
          app.log.error(err, 'Error in background poller');
        } finally {
          isPolling = false;
        }
      }, env.POLL_INTERVAL_MS);
    }

  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

app.addHook('onClose', async () => {
  if (pollerInterval) {
    clearInterval(pollerInterval);
  }
});

start();
