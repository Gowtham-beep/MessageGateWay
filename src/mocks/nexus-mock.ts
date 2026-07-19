import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { env } from '../config/env.js';
import { nexusQueue, nexusMessages, getNextNexusId } from './state.js';
import crypto from 'crypto';

export const nexusMockRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post('/v1/send', async (request, reply) => {
    const auth = request.headers.authorization;
    if (auth !== `Bearer ${env.NEXUS_TOKEN}`) {
      return reply.status(401).send({ error: 'unauthorized' });
    }

    const body = request.body as any;
    if (!body || !body.client_ref || !body.to || !body.text) {
      return reply.status(400).send({ error: 'bad_request' });
    }

    const scenario = nexusQueue.shift() || 'ok';

    if (scenario === 'rate_limit') {
      reply.header('Retry-After', '1');
      return reply.status(429).send({ error: 'rate_limited' });
    }

    if (scenario === 'server_error') {
      return reply.status(503).send({ error: 'upstream_error' });
    }

    if (scenario === 'timeout') {
      await new Promise(resolve => setTimeout(resolve, env.MOCK_TIMEOUT_MS));
      return reply.status(504).send({ error: 'timeout' });
    }

    const msgId = getNextNexusId();
    nexusMessages.set(msgId, {
      clientRef: body.client_ref,
      destination: body.to,
      status: 'accepted'
    });

    return reply.status(200).send({ provider_message_id: msgId, status: 'accepted' });
  });

  fastify.post('/__control/fire-dlr', async (request, reply) => {
    const body = request.body as any;
    if (!body || !body.provider_message_id || !body.status) {
      return reply.status(400).send({ error: 'missing_fields' });
    }
    
    const msg = nexusMessages.get(body.provider_message_id);
    if (!msg) {
      return reply.status(404).send({ error: 'message_not_found' });
    }

    const eventId = `${body.provider_message_id}:${body.status}`;
    const timestamp = Date.now().toString();

    const payload = {
      event_id: eventId,
      provider_message_id: body.provider_message_id,
      client_ref: msg.clientRef,
      status: body.status,
      timestamp
    };

    const payloadStr = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', env.NEXUS_WEBHOOK_SECRET)
                            .update(payloadStr)
                            .digest('hex');

    try {
      const res = await fetch(`${env.GATEWAY_URL}/webhooks/nexus/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-nexus-signature': signature,
          'x-nexus-timestamp': timestamp
        },
        body: payloadStr
      });
      return reply.status(200).send({ gateway_status: res.status });
    } catch (err: any) {
      return reply.status(500).send({ error: 'fetch_failed', detail: err.message });
    }
  });
};
