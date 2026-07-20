import { Logger } from 'pino';
import { MessageRow, claimForSend, applyStatus, incrementAttempt, markFailoverUsed, getByClientRef } from '../store/messages.js';
import { resolveRoute } from '../router/index.js';
import { sendViaNexus } from '../providers/nexus.js';
import { sendViaOrbit } from '../providers/orbit.js';
import { ProviderSendResult, mapNexusStatus, mapOrbitStatus } from '../providers/types.js';
import { computeDelay } from '../lib/backoff.js';

type ProviderName = 'nexus' | 'orbit';

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

  if (row.send_claimed === 1) return row;
  
  const claimed = claimForSend(clientRef);
  if (!claimed) return getByClientRef(clientRef)!;

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
      applyStatus(clientRef, 'FAILED', { lastError: 'rate_limited after 3 attempts' });
    } else if (primaryResult.kind === 'server_error' || primaryResult.kind === 'timeout') {
      if (plan.route === 'auto' && row.failover_used === 0) {
        markFailoverUsed(clientRef);
        log.warn({ provider: plan.fallback, status: 'SUBMITTED' }, 'Primary failed, initiating failover');
        
        incrementAttempt(clientRef);
        const fallbackResult = await sendViaOrbit({ clientRef: row.client_ref, destination: row.destination, text: row.text });
        
        if (fallbackResult.ok) {
          const status = mapOrbitStatus(fallbackResult.rawStatus) || 'SUBMITTED';
          log.info({ provider: 'orbit', attempt: 1, outcome: fallbackResult, status }, 'Fallback dispatch success');
          applyStatus(clientRef, status, { provider: 'orbit', providerMessageId: fallbackResult.providerMessageId, rawStatus: fallbackResult.rawStatus });
        } else {
          log.error({ provider: 'orbit', attempt: 1, outcome: fallbackResult, status: 'FAILED' }, 'Fallback dispatch failed');
          applyStatus(clientRef, 'FAILED', { lastError: fallbackResult.detail });
        }
      } else {
        applyStatus(clientRef, 'FAILED', { lastError: primaryResult.detail });
      }
    } else {
      applyStatus(clientRef, 'FAILED', { lastError: primaryResult.detail });
    }
  }

  return getByClientRef(clientRef)!;
}
