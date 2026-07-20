import { findPendingForPolling, applyStatus } from '../store/messages.js';
import { fetchOrbitStatus } from '../providers/orbit.js';
import { mapOrbitStatus } from '../providers/types.js';
import { getChildLogger } from '../lib/logger.js';

export async function pollPending({ limit = 50 } = {}) {
  const pending = findPendingForPolling('orbit', limit);
  let polled = 0;
  let updated = 0;
  let unchanged = 0;
  let errors = 0;
  const results = [];

  for (const row of pending) {
    if (!row.provider_message_id) continue;
    
    polled++;
    const log = getChildLogger(row.client_ref);
    const result = await fetchOrbitStatus(row.provider_message_id);

    if (!result.ok) {
      errors++;
      log.error({ detail: result.detail }, 'Failed to fetch orbit status');
      applyStatus(row.client_ref, row.status, { lastError: result.detail });
      results.push({ client_ref: row.client_ref, status: row.status, applied: false });
      continue;
    }

    const rawStatus = result.rawStatus;
    const mappedStatus = mapOrbitStatus(rawStatus);

    if (!mappedStatus) {
      log.warn({ raw_status: rawStatus }, 'Unknown orbit status');
      unchanged++;
      results.push({ client_ref: row.client_ref, raw_status: rawStatus, status: row.status, applied: false });
      continue;
    }

    const { applied, row: updatedRow } = applyStatus(row.client_ref, mappedStatus, { provider: 'orbit', rawStatus });
    
    if (applied) {
      updated++;
      log.info({ raw_status: rawStatus, mappedStatus }, 'Orbit status updated');
    } else {
      unchanged++;
    }
    
    results.push({ client_ref: row.client_ref, raw_status: rawStatus, status: updatedRow.status, applied });
  }

  return { polled, updated, unchanged, errors, results };
}
