import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getChildLogger } from '../lib/logger.js';
import { insertIfAbsent, getByClientRef } from '../store/messages.js';
import { listEvents } from '../store/events.js';
import { resolveRoute } from '../router/index.js';
import { dispatch } from '../core/dispatch.js';

const sendSchema = z.object({
  client_ref: z.string().min(1),
  sender_id: z.string(),
  channel: z.literal('sms'),
  destination: z.string().regex(/^\+[1-9]\d{7,14}$/, 'Invalid E.164 number'),
  text: z.string().min(1).max(1600)
});

export const messagesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post('/v1/messages', async (request, reply) => {
    if (!request.body || Object.keys(request.body as object).length === 0) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Empty body' } });
    }

    const parsed = sendSchema.safeParse(request.body);
    if (!parsed.success) {
      const err = parsed.error.issues[0];
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: err.message, field: err.path.join('.') } });
    }

    const input = parsed.data;
    const plan = resolveRoute(input.sender_id);
    if (!plan) {
      return reply.status(400).send({ error: { code: 'UNKNOWN_SENDER_ID', message: 'Sender ID not configured' } });
    }

    const { row, created } = insertIfAbsent({
      client_ref: input.client_ref,
      sender_id: input.sender_id,
      channel: input.channel,
      destination: input.destination,
      text: input.text,
      route: plan.route
    });

    if (!created) {
      if (row.destination !== input.destination || row.text !== input.text || row.sender_id !== input.sender_id) {
        return reply.status(409).send({ error: { code: 'CLIENT_REF_CONFLICT', message: 'Payload differs' } });
      }
      return reply.status(200).send(row);
    }

    const log = getChildLogger(input.client_ref);
    const finalRow = await dispatch(input.client_ref, log);

    return reply.status(202).send(finalRow);
  });

  fastify.get('/v1/messages/:client_ref', async (request, reply) => {
    const { client_ref } = request.params as { client_ref: string };
    const row = getByClientRef(client_ref);
    if (!row) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Message not found' } });
    }
    
    const events = listEvents(client_ref);
    
    return reply.status(200).send({
      client_ref: row.client_ref,
      sender_id: row.sender_id,
      destination: row.destination,
      status: row.status,
      provider: row.provider,
      provider_message_id: row.provider_message_id,
      attempts: row.attempts,
      failover_used: row.failover_used,
      last_error: row.last_error,
      created_at: row.created_at,
      updated_at: row.updated_at,
      events
    });
  });
};
