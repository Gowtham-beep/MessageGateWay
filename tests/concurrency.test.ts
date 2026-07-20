import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { buildTestEnv } from './helpers/harness.js';
import { resetDb } from '../src/store/db.js';
import * as state from '../src/mocks/state.js';
import { env as realEnv } from '../src/config/env.js';
import { insertIfAbsent, claimForSend } from '../src/store/messages.js';
import { dispatch, __setBeforeClaimHook } from '../src/core/dispatch.js';
import { getChildLogger } from '../src/lib/logger.js';
import { db } from '../src/store/db.js';

describe('Concurrency', () => {
  let env: Awaited<ReturnType<typeof buildTestEnv>>;
  
  beforeEach(async () => {
    resetDb();
    state.resetMocks();
    __setBeforeClaimHook(null);
    if (!env) env = await buildTestEnv();
  });
  
  afterAll(async () => {
    if (env) {
      await env.app.close();
      env.mocks.close();
    }
  });

  it('true race on claim', async () => {
    const ref = 'ref-race-1';
    insertIfAbsent({ client_ref: ref, sender_id: 'NEXUS01', channel: 'sms', destination: '+123', text: 'test', route: 'nexus' });
    
    let enterCount = 0;
    let resolveBarrier: () => void;
    const barrier = new Promise<void>(res => resolveBarrier = res);
    
    __setBeforeClaimHook(async () => {
      enterCount++;
      if (enterCount === 2) {
        resolveBarrier();
      } else {
        await barrier;
      }
    });
    
    const p1 = dispatch(ref, getChildLogger(ref));
    const p2 = dispatch(ref, getChildLogger(ref));
    
    const [res1, res2] = await Promise.all([p1, p2]);
    
    expect(state.nexusMessages.size).toBe(1);
    
    const events = db.prepare("SELECT * FROM message_events WHERE client_ref = ?").all(ref) as any[];
    const submits = events.filter(e => e.to_status === 'SUBMITTED');
    expect(submits.length).toBe(1);
    
    expect(res1.provider_message_id).toBeTruthy();
    expect(res2.provider_message_id).toBe(res1.provider_message_id);
  });
  
  it('pre-claimed message is never sent', async () => {
    const ref = 'ref-pre-1';
    insertIfAbsent({ client_ref: ref, sender_id: 'NEXUS01', channel: 'sms', destination: '+123', text: 'test', route: 'nexus' });
    claimForSend(ref); // claim directly
    
    // Status is ACCEPTED, so it will loop. We mock the timeout.
    const oldWait = realEnv.DISPATCH_WAIT_MS;
    realEnv.DISPATCH_WAIT_MS = 50;
    
    await dispatch(ref, getChildLogger(ref));
    realEnv.DISPATCH_WAIT_MS = oldWait;
    
    expect(state.nexusMessages.size).toBe(0);
  });
  
  it('claim is single-winner under N callers', async () => {
    const ref = 'ref-n-1';
    insertIfAbsent({ client_ref: ref, sender_id: 'NEXUS01', channel: 'sms', destination: '+123', text: 'test', route: 'nexus' });
    
    const N = 20;
    let enterCount = 0;
    let resolveBarrier: () => void;
    const barrier = new Promise<void>(res => resolveBarrier = res);
    
    __setBeforeClaimHook(async () => {
      enterCount++;
      if (enterCount === N) {
        resolveBarrier();
      } else {
        await barrier;
      }
    });
    
    const promises = Array(N).fill(0).map(() => dispatch(ref, getChildLogger(ref)));
    await Promise.all(promises);
    
    expect(state.nexusMessages.size).toBe(1);
  });
});
