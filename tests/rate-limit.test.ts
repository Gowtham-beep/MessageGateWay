import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildTestEnv, postMessage } from './helpers/harness.js';
import { resetDb } from '../src/store/db.js';
import * as state from '../src/mocks/state.js';
import { resetMocks, pushNexusScenario } from '../src/mocks/state.js';
import { computeDelay } from '../src/lib/backoff.js';

describe('Rate Limiting & Backoff', () => {
  let env: any;
  beforeAll(async () => { env = await buildTestEnv(); });
  afterAll(async () => { await env.app.close(); await env.mocks.close(); });
  beforeEach(() => { resetDb(); resetMocks(); });

  it('14. Script [rate_limit,rate_limit,ok]: ends SUBMITTED, attempts=3, exactly one stored in nexusMessages', async () => {
    pushNexusScenario(['rate_limit', 'rate_limit', 'ok']);
    
    const res = await postMessage(env.app, { sender_id: 'NEXUS01' });
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('SUBMITTED');
    expect(res.json().attempts).toBe(3);
    expect(state.nexusMessages.size).toBe(1);
  });

  it('15. Script [rate_limit,rate_limit,rate_limit]: status FAILED, last_error mentions rate limit, attempts=3', async () => {
    pushNexusScenario(['rate_limit', 'rate_limit', 'rate_limit']);
    
    const res = await postMessage(env.app, { sender_id: 'NEXUS01' });
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('FAILED');
    expect(res.json().attempts).toBe(3);
    expect(res.json().last_error).toContain('rate_limited');
  });

  it('16. computeDelay unit test', () => {
    const base = 100;
    const max = 2000;
    const a1 = Array(100).fill(0).map(() => computeDelay(1, { baseMs: base, maxMs: max, jitter: 'full' }));
    const a2 = Array(100).fill(0).map(() => computeDelay(2, { baseMs: base, maxMs: max, jitter: 'full' }));
    const a3 = Array(100).fill(0).map(() => computeDelay(3, { baseMs: base, maxMs: max, jitter: 'full' }));
    
    const avg = (arr: number[]) => arr.reduce((a,b)=>a+b,0)/arr.length;
    expect(avg(a2)).toBeGreaterThan(avg(a1));
    expect(avg(a3)).toBeGreaterThan(avg(a2));
    
    expect(Math.max(...a3)).toBeLessThanOrEqual(max);
    
    const uniqueA2 = new Set(a2);
    expect(uniqueA2.size).toBeGreaterThan(10);
  });
});
