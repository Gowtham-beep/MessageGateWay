import { Logger } from 'pino';
import { MessageRow, claimForSend, applyStatus, incrementAttempt, markFailoverUsed, getByClientRef, recordEvent } from '../store/messages.js';
import { resolveRoute } from '../router/index.js';
import { sendViaNexus } from '../providers/nexus.js';
import { sendViaOrbit } from '../providers/orbit.js';
import { ProviderSendResult, mapNexusStatus, mapOrbitStatus } from '../providers/types.js';
import { computeDelay } from '../lib/backoff.js';
import { env } from '../config/env.js';

type ProviderName = 'nexus' | 'orbit';

function formatProviderError(provider: string, result: Extract<ProviderSendResult, { ok: false }>) {
  if (result.kind === 'rate_limited') return `${provider} rate_limited after 3 attempts`;
  if (result.status) return `${provider} ${result.kind} (${result.status})`;
  if (result.kind === 'timeout') return `${provider} timeout after ${provider === 'nexus' ? env.NEXUS_TIMEOUT_MS : 5000}ms`;
  return `${provider} ${result.kind}: ${result.detail}`;
}

// TEST SEAM: Used by concurrency tests to force interleaving
export let __beforeClaimHook: (() => Promise<void>) | null = null;
export function __setBeforeClaimHook(fn: typeof __beforeClaimHook) { __beforeClaimHook = fn; }

const setTimeoutAsync = (ms: number) => new Promise(res => setTimeout(res, ms));

async function sendWithRetry(provider: ProviderName, msg: MessageRow, log: Logger): Promise<{ result: ProviderSendResult, attemptCount: number }> {
  let attemptCount = 0;
  let result: ProviderSendResult;

  while (attemptCount < 3) {
    attemptCount++;
    incrementAttempt(msg.client_ref);

    const sendArgs = { clientRef: msg.client_ref, destination: msg.destination, text: msg.text };
    result = provider === 'nexus' ? await sendViaNexus(sendArgs) : await sendViaOrbit(sendArgs);

    if (result.ok) break;
    if (result.kind !== 'rate_limited') break;

    log.warn({ provider, attempt: attemptCount, outcome: result }, 'Rate limited, retrying');
    
    if (attemptCount < 3) {
      const delay = computeDelay(attemptCount, { baseMs: 100, maxMs: 2000, jitter: 'full' });
      await setTimeoutAsync(delay);
    }
  }

  return { result: result!, attemptCount };
}

export async function dispatch(clientRef: string, log: Logger): Promise<MessageRow> {
  const row = getByClientRef(clientRef);
  if (!row) throw new Error('Message not found');

  if (row.send_claimed === 1) {
    let current = row;
    let waited = 0;
    while (current.status === 'ACCEPTED' && waited < env.DISPATCH_WAIT_MS) {
      await setTimeoutAsync(25);
      waited += 25;
      current = getByClientRef(clientRef)!;
    }
    return current;
  }
  
  if (__beforeClaimHook) await __beforeClaimHook();
  
  const claimed = claimForSend(clientRef);
  if (!claimed) {
    let current = getByClientRef(clientRef)!;
    let waited = 0;
    while (current.status === 'ACCEPTED' && waited < env.DISPATCH_WAIT_MS) {
      await setTimeoutAsync(25);
      waited += 25;
      current = getByClientRef(clientRef)!;
    }
    return current;
  }

  const plan = resolveRoute(row.sender_id);
  if (!plan) {
    applyStatus(clientRef, 'FAILED', { lastError: 'Unknown route' });
    return getByClientRef(clientRef)!;
  }

  const { result: primaryResult, attemptCount } = await sendWithRetry(plan.primary, row, log);

  if (primaryResult.ok) {
    const status = plan.primary === 'nexus' ? mapNexusStatus(primaryResult.rawStatus) : mapOrbitStatus(primaryResult.rawStatus);
    log.info({ provider: plan.primary, attempt: attemptCount, outcome: primaryResult, status: status || 'SUBMITTED' }, 'Primary dispatch success');
    applyStatus(clientRef, status || 'SUBMITTED', { provider: plan.primary, providerMessageId: primaryResult.providerMessageId, rawStatus: primaryResult.rawStatus });
  } else {
    log.error({ provider: plan.primary, attempt: attemptCount, outcome: primaryResult, status: 'FAILED' }, 'Primary dispatch failed');
    
    if (primaryResult.kind === 'rate_limited') {
      applyStatus(clientRef, 'FAILED', { lastError: formatProviderError(plan.primary, primaryResult) });
    } else if (primaryResult.kind === 'server_error' || primaryResult.kind === 'timeout') {
      if (plan.route === 'auto' && row.failover_used === 0) {
        markFailoverUsed(clientRef);
        log.warn({ provider: plan.fallback, status: 'SUBMITTED' }, 'Primary failed, initiating failover');
        
        recordEvent(clientRef, {
          fromStatus: row.status,
          toStatus: row.status,
          provider: 'nexus',
          rawStatus: null,
          detail: `failover: nexus ${primaryResult.kind} -> orbit`
        });
        
        incrementAttempt(clientRef);
        const fallbackResult = await sendViaOrbit({ clientRef: row.client_ref, destination: row.destination, text: row.text });
        
        if (fallbackResult.ok) {
          const status = mapOrbitStatus(fallbackResult.rawStatus) || 'SUBMITTED';
          log.info({ provider: 'orbit', attempt: 1, outcome: fallbackResult, status }, 'Fallback dispatch success');
          applyStatus(clientRef, status, { provider: 'orbit', providerMessageId: fallbackResult.providerMessageId, rawStatus: fallbackResult.rawStatus });
        } else {
          log.error({ provider: 'orbit', attempt: 1, outcome: fallbackResult, status: 'FAILED' }, 'Fallback dispatch failed');
          applyStatus(clientRef, 'FAILED', { provider: 'orbit', lastError: formatProviderError('orbit', fallbackResult) });
        }
      } else {
        applyStatus(clientRef, 'FAILED', { provider: plan.primary, lastError: formatProviderError(plan.primary, primaryResult) });
      }
    } else {
      applyStatus(clientRef, 'FAILED', { provider: plan.primary, lastError: formatProviderError(plan.primary, primaryResult) });
    }
  }

  return getByClientRef(clientRef)!;
}
