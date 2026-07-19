import { FastifyInstance, FastifyPluginAsync } from 'fastify';

export const dlrRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post('/v1/dlr/poll', async (request, reply) => {
    return reply.status(501).send({ error: 'Not implemented' });
  });
};
