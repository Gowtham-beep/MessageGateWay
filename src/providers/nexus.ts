import { env } from '../config/env.js';
import { ProviderSendResult } from './types.js';
import crypto from 'crypto';

interface SendArgs {
  clientRef: string;
  destination: string;
  text: string;
}

export async function sendViaNexus({ clientRef, destination, text }: SendArgs): Promise<ProviderSendResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.NEXUS_TIMEOUT_MS);
  
  try {
    const res = await fetch(`${env.PROVIDER_BASE_URL}/nexus/v1/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.NEXUS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ client_ref: clientRef, to: destination, text }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json() as any;
      return { ok: true, providerMessageId: data.provider_message_id, rawStatus: data.status };
    }

    if (res.status === 429) return { ok: false, kind: 'rate_limited', status: 429, detail: 'Rate limited' };
    if (res.status === 401) return { ok: false, kind: 'auth', status: 401, detail: 'Unauthorized' };
    if (res.status >= 500) return { ok: false, kind: 'server_error', status: res.status, detail: 'Server error' };
    return { ok: false, kind: 'invalid', status: res.status, detail: 'Invalid request' };

  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') return { ok: false, kind: 'timeout', detail: 'Request timed out' };
    return { ok: false, kind: 'server_error', detail: err.message };
  }
}

export function verifyNexusSignature(rawBody: string, signature: string): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', env.NEXUS_WEBHOOK_SECRET)
                         .update(rawBody)
                         .digest('hex');
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
