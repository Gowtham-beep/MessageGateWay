interface BackoffOpts {
  baseMs?: number;
  maxMs?: number;
  jitter?: 'full' | 'none';
}

export function computeDelay(attempt: number, opts: BackoffOpts = {}): number {
  const baseMs = opts.baseMs ?? 100;
  const maxMs = opts.maxMs ?? 2000;
  const useJitter = opts.jitter === 'full';
  
  let backoff = Math.min(maxMs, baseMs * Math.pow(2, attempt - 1));
  if (useJitter) {
    backoff = Math.random() * backoff;
  }
  return backoff;
}

export function calculateBackoff(attempt: number, baseDelay: number = 100, maxDelay: number = 30000): number {
  return computeDelay(attempt, { baseMs: baseDelay, maxMs: maxDelay, jitter: 'full' });
}
