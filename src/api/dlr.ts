import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { pollPending } from '../poller/index.js';

export const dlrRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post('/v1/dlr/poll', async (request, reply) => {
    const body = request.body as any;
    const limit = body && typeof body.limit === 'number' ? body.limit : 50;
    const result = await pollPending({ limit });
    return reply.status(200).send(result);
  });
};
