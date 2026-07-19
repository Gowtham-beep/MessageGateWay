import fastify from 'fastify';
import { env } from '../config/env.js';
import { nexusMockRoutes } from './nexus-mock.js';
import { orbitMockRoutes } from './orbit-mock.js';
import { resetMocks, pushNexusScenario, setOrbitScript } from './state.js';
import { fileURLToPath } from 'url';

export function buildMockServer() {
  const app = fastify({ logger: false });

  app.register(nexusMockRoutes, { prefix: '/nexus' });
  app.register(orbitMockRoutes, { prefix: '/orbit' });

  app.post('/__control/reset', async (req, reply) => {
    resetMocks();
    return reply.status(204).send();
  });

  app.post('/__control/nexus/scenario', async (req, reply) => {
    const body = req.body as any;
    if (body.kind) pushNexusScenario(body.kind);
    if (body.kinds) pushNexusScenario(body.kinds);
    return reply.status(200).send({ ok: true });
  });

  app.post('/__control/orbit/script', async (req, reply) => {
    const body = req.body as any;
    if (body.client_ref && body.statuses) {
      setOrbitScript(body.client_ref, body.statuses);
    }
    return reply.status(200).send({ ok: true });
  });

  return app;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const app = buildMockServer();
  app.listen({ port: env.PROVIDER_PORT, host: '0.0.0.0' })
    .then(() => console.log(`Mock Server listening on port ${env.PROVIDER_PORT}`))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
