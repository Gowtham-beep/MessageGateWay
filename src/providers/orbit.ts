import { env } from '../config/env.js';
import { ProviderSendResult } from './types.js';

interface SendArgs {
  clientRef: string;
  destination: string;
  text: string;
}

export async function sendViaOrbit({ clientRef, destination, text }: SendArgs): Promise<ProviderSendResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.NEXUS_TIMEOUT_MS);
  
  try {
    const res = await fetch(`${env.PROVIDER_BASE_URL}/orbit/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': env.ORBIT_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ client_ref: clientRef, to: destination, text }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (res.status === 202) {
      const data = await res.json() as any;
      return { ok: true, providerMessageId: data.id, rawStatus: data.state };
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

export async function fetchOrbitStatus(providerMessageId: string): Promise<{ ok: true, rawStatus: string } | { ok: false, detail: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.NEXUS_TIMEOUT_MS);
  
  try {
    const res = await fetch(`${env.PROVIDER_BASE_URL}/orbit/messages/${providerMessageId}/status`, {
      headers: { 'x-api-key': env.ORBIT_API_KEY },
      signal: controller.signal
    });

    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json() as any;
      return { ok: true, rawStatus: data.state };
    }
    return { ok: false, detail: `Status ${res.status}` };
  } catch (err: any) {
    clearTimeout(timeout);
    return { ok: false, detail: err.message };
  }
}
