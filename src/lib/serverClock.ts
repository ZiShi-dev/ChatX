let sample: { server: number; monotonic: number } | undefined;

/** HTTP Date avoids dependence on the phone's wall clock; monotonic time keeps it advancing. */
export function syncServerClock(date: string | null) {
  if (!date) return;
  const server = Date.parse(date);
  if (Number.isFinite(server)) sample = { server, monotonic: performance.now() };
}

export function serverNow() {
  return sample ? sample.server + Math.max(0, performance.now() - sample.monotonic) : Date.now();
}

export function resetServerClock() { sample = undefined; }
