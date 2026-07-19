/**
 * Exponential backoff with jitter
 * @param attempt Current attempt number (starts at 1)
 * @param baseDelay Base delay in ms
 * @param maxDelay Maximum delay in ms
 * @returns Delay in ms
 */
export function calculateBackoff(attempt: number, baseDelay: number = 100, maxDelay: number = 30000): number {
  const backoff = Math.min(maxDelay, baseDelay * Math.pow(2, attempt - 1));
  const jitter = Math.random() * (backoff * 0.2); // 20% jitter
  return backoff + jitter;
}
