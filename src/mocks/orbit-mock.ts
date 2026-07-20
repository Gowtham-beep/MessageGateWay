import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { env } from '../config/env.js';
import { orbitMessages, orbitScript, getNextOrbitId, orbitQueue } from './state.js';

export const orbitMockRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post('/messages', async (request, reply) => {
    const apiKey = request.headers['x-api-key'];
    if (apiKey !== env.ORBIT_API_KEY) {
      return reply.status(401).send({ error: 'unauthorized' });
    }

    const body = request.body as any;
    if (!body || !body.client_ref || !body.to || !body.text) {
      return reply.status(400).send({ error: 'bad_request' });
    }

    const scenario = orbitQueue.shift() || 'ok';
    if (scenario === 'rate_limit') return reply.status(429).send({ error: 'rate_limited' });
    if (scenario === 'server_error') return reply.status(503).send({ error: 'server_error' });
    if (scenario === 'timeout') {
      await new Promise(r => setTimeout(r, env.MOCK_TIMEOUT_MS));
      return reply.status(504).send({ error: 'timeout' });
    }

    const id = getNextOrbitId();
    orbitMessages.set(id, {
      clientRef: body.client_ref,
      destination: body.to,
      status: 'queued',
      pollsSeen: 0
    });

    return reply.status(202).send({ id, state: 'queued' });
  });

  fastify.get('/messages/:id/status', async (request, reply) => {
    const params = request.params as any;
    const msg = orbitMessages.get(params.id);
    if (!msg) {
      return reply.status(404).send({ error: 'not_found' });
    }

    msg.pollsSeen++;
    let nextState = msg.status;
    
    const script = orbitScript.get(msg.clientRef);
    if (script && script.length > 0) {
      const idx = Math.min(msg.pollsSeen - 1, script.length - 1);
      nextState = script[idx];
    } else {
      if (msg.pollsSeen === 1) nextState = 'queued';
      else if (msg.pollsSeen === 2) nextState = 'sending';
      else nextState = 'delivered';
    }
    
    msg.status = nextState;

    return reply.status(200).send({
      id: params.id,
      state: nextState,
      updated_at: new Date().toISOString()
    });
  });
};
