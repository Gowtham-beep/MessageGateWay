import { MessageStatus } from '../store/messages.js';

export type ProviderSendResult =
  | { ok: true, providerMessageId: string, rawStatus: string }
  | { ok: false, kind: 'rate_limited' | 'server_error' | 'timeout' | 'auth' | 'invalid', status?: number, detail: string };

export interface SendOutcome {
  status: 'sent' | 'failed' | 'queued';
  providerRef?: string;
  error?: Error;
}

export function mapNexusStatus(raw: string): MessageStatus | null {
  switch (raw) {
    case 'accepted': return 'SUBMITTED';
    case 'sent': return 'SENT';
    case 'delivered': return 'DELIVERED';
    case 'undelivered':
    case 'expired': return 'FAILED';
    default: return null;
  }
}

export function mapOrbitStatus(raw: string): MessageStatus | null {
  switch (raw) {
    case 'queued': return 'SUBMITTED';
    case 'sending': return 'SENT';
    case 'delivered': return 'DELIVERED';
    case 'failed':
    case 'rejected': return 'FAILED';
    default: return null;
  }
}
