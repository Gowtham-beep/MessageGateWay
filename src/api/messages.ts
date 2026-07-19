import { FastifyInstance, FastifyPluginAsync } from 'fastify';

export const messagesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post('/v1/messages', async (request, reply) => {
    return reply.status(501).send({ error: 'Not implemented' });
  });

  fastify.get('/v1/messages/:client_ref', async (request, reply) => {
    return reply.status(501).send({ error: 'Not implemented' });
  });
};
