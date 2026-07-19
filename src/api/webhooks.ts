import { FastifyInstance, FastifyPluginAsync } from 'fastify';

export const webhookRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post('/webhooks/nexus/status', async (request, reply) => {
    return reply.status(501).send({ error: 'Not implemented' });
  });
};
