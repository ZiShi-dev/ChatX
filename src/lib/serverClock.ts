let sample: { server: number; monotonic: number; authoritative: boolean } | undefined;

/** HTTP Date avoids dependence on the phone's wall clock; monotonic time keeps it advancing. */
export function syncServerClock(date: string | null, authoritative = false) {
  if (!date) return;
  if (!authoritative && sample?.authoritative && performance.now() - sample.monotonic < 120_000) return;
  const server = Date.parse(date);
  if (Number.isFinite(server)) sample = { server, monotonic: performance.now(), authoritative };
}

export function serverNow() {
  return sample ? sample.server + Math.max(0, performance.now() - sample.monotonic) : Date.now();
}

export function resetServerClock() { sample = undefined; }
