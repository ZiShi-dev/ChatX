import { setTimeout as delay } from 'node:timers/promises';

/** Bounded retries stay on the VPS, never in a mobile polling loop. */
export async function deliverPush(
  request: () => Promise<Response>,
  stillAllowed: () => Promise<boolean>,
  wait: (ms: number) => Promise<unknown> = ms => delay(ms, undefined, { ref: false }),
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt && !await stillAllowed()) return null;
    let response: Response | undefined;
    try { response = await request(); } catch { /* Network failures can recover. */ }
    if (response && response.status !== 401 && response.status !== 429 && response.status < 500) return response;
    if (attempt === 2) return response ?? null;
    const value = response?.headers.get('retry-after');
    const seconds = value && /^\d+$/.test(value) ? Number(value) * 1000 : value ? Date.parse(value) - Date.now() : 0;
    const backoff = response?.status === 429 ? 60_000 * 2 ** attempt : response?.status === 401 ? 0 : 1000 * 2 ** attempt;
    const pause = Math.max(backoff, Number.isFinite(seconds) ? seconds : 0);
    // A long server-directed pause is left to inbox recovery; do not retain jobs indefinitely.
    if (pause > 600_000) return response ?? null;
    await wait(pause);
  }
  return null;
}
