import fastify from 'fastify';
import { env } from '../config/env.js';
import { nexusMockRoutes } from './nexus-mock.js';
import { orbitMockRoutes } from './orbit-mock.js';

const app = fastify({ logger: true });

app.register(nexusMockRoutes);
app.register(orbitMockRoutes);

const start = async () => {
  try {
    await app.listen({ port: env.PROVIDER_PORT, host: '0.0.0.0' });
    app.log.info(`Mock Server listening on port ${env.PROVIDER_PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
