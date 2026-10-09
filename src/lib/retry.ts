export function retryDelay(attempt: number, retryAfter = 0, random = Math.random) {
  const cap = Math.min(60_000, 2000 * 2 ** Math.min(Math.max(0, attempt - 1), 5));
  return Math.max(retryAfter, Math.round(cap * (0.8 + random() * 0.4)));
}

export function retryAfterMs(value: string | null, now = Date.now()) {
  if (!value) return 0;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.max(0, Math.min(delay, 86_400_000)) : 0;
}

export function retryableStatus(status: number) {
  return status === 0 || status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}
