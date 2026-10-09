const rooms = new Map<string, Set<() => void>>();

/** How long an open conversation stays listening before it asks again. */
export const LIVE_HOLD_MS = 12_000;

export function wakeRoom(roomId: string) {
  const waiting = rooms.get(roomId);
  if (!waiting) return;
  rooms.delete(roomId);
  for (const wake of waiting) wake();
}

/** Arm before reading, so a message that arrives during the read is not missed. */
export function armRoomWatch(roomId: string) {
  let done = false;
  const waiting = rooms.get(roomId) ?? new Set<() => void>();
  rooms.set(roomId, waiting);
  let finish = () => undefined;
  const promise = new Promise<void>((resolve) => {
    finish = () => {
      if (done) return;
      done = true;
      waiting.delete(finish);
      if (waiting.size === 0 && rooms.get(roomId) === waiting) rooms.delete(roomId);
      resolve();
    };
  });
  waiting.add(finish);
  return {
    cancel: finish,
    wait(ms: number, signal?: AbortSignal) {
      if (signal?.aborted) {
        finish();
        return Promise.resolve();
      }
      const timer = setTimeout(finish, ms);
      const onAbort = () => finish();
      signal?.addEventListener('abort', onAbort, { once: true });
      return promise.finally(() => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      });
    },
  };
}
