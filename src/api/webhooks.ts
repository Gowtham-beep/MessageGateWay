import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { env } from '../config/env.js';
import { verifyNexusSignature } from '../providers/nexus.js';
import { recordWebhookEvent } from '../store/events.js';
import { applyStatus, getByClientRef } from '../store/messages.js';
import { mapNexusStatus } from '../providers/types.js';
import { getChildLogger } from '../lib/logger.js';

export const webhookRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body: string, done) {
    try {
      (req as any).rawBody = body;
      const json = body ? JSON.parse(body) : undefined;
      done(null, json);
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  fastify.post('/webhooks/nexus/status', async (request, reply) => {
    const signature = request.headers['x-nexus-signature'] as string;
    const timestampStr = request.headers['x-nexus-timestamp'] as string;

    if (!signature || !timestampStr) {
      return reply.status(401).send({ error: { code: 'MISSING_SIGNATURE' } });
    }

    const ts = parseInt(timestampStr, 10);
    const now = Date.now();
    if (Math.abs(now - ts) > env.WEBHOOK_TOLERANCE_SEC * 1000) {
      return reply.status(401).send({ error: { code: 'STALE_WEBHOOK' } });
    }

    const rawBody = (request as any).rawBody as string;
    if (!verifyNexusSignature(rawBody, signature)) {
      return reply.status(401).send({ error: { code: 'INVALID_SIGNATURE' } });
    }

    const body = request.body as any;
    if (!body || !body.event_id || !body.provider_message_id || !body.client_ref || !body.status) {
      return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: 'Malformed payload' } });
    }

    const { event_id, provider_message_id, client_ref, status } = body;
    const log = getChildLogger(client_ref);

    const row = getByClientRef(client_ref);
    if (!row) {
      log.warn({ event_id, provider_message_id }, 'Webhook received for unknown client_ref');
      return reply.status(200).send({ ok: true, ignored: 'unknown_client_ref' });
    }

    const inserted = recordWebhookEvent('nexus', event_id, client_ref);
    if (!inserted) {
      log.info({ event_id }, 'Duplicate webhook ignored');
      return reply.status(200).send({ ok: true, duplicate: true });
    }

    const mappedStatus = mapNexusStatus(status);
    if (!mappedStatus) {
      log.warn({ raw_status: status }, 'Unknown nexus status');
      return reply.status(200).send({ ok: true, ignored: 'unknown_status' });
    }

    const { applied, row: updatedRow } = applyStatus(client_ref, mappedStatus, {
      provider: 'nexus',
      rawStatus: status,
      providerMessageId: provider_message_id
    });

    log.info({ event_id, applied, mappedStatus }, 'Webhook processed');
    return reply.status(200).send({ ok: true, applied, status: updatedRow.status });
  });
};
