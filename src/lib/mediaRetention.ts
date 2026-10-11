export function formatPurgeCountdown(remainingMs: number) {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function nextMediaPurgeAt(lastPurgeAt: string | null, nextPurgeAt: string | null, intervalMs: number) {
  if (nextPurgeAt) {
    const parsed = Date.parse(nextPurgeAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (lastPurgeAt) {
    const parsed = Date.parse(lastPurgeAt);
    if (Number.isFinite(parsed)) return parsed + intervalMs;
  }
  return null;
}
