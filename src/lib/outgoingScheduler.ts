export type QueuedSend = { id: string; conversationId: string; type: string; createdAt: string; retryAt?: number };

/** One owner controls concurrency and timers for every outgoing conversation. */
export function createOutgoingScheduler(options: {
  pending: () => QueuedSend[];
  available: () => boolean;
  concurrency: () => number;
  send: (id: string) => Promise<void>;
}) {
  const active = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const lane = (item: QueuedSend) => `${item.conversationId}:${item.type === 'text' ? 'text' : 'media'}`;
  const wake = () => {
    clearTimeout(timer); timer = undefined;
    if (stopped || !options.available()) return;
    const pending = options.pending().sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    // Preserve text order without putting texts behind a slow attachment.
    const heads = pending.filter((item, index) => !pending.slice(0, index).some((older) => lane(older) === lane(item)));
    heads.sort((a, b) => Number(a.type !== 'text') - Number(b.type !== 'text') || a.createdAt.localeCompare(b.createdAt));
    for (const item of heads) {
      if (active.size >= options.concurrency()) break;
      if (active.has(item.id) || [...active.values()].includes(lane(item)) || (item.retryAt ?? 0) > Date.now()) continue;
      active.set(item.id, lane(item));
      void options.send(item.id).catch(() => undefined).finally(() => { active.delete(item.id); wake(); });
    }
    const due = heads.filter((item) => !active.has(item.id)).map((item) => item.retryAt ?? 0).filter((at) => at > Date.now() && at < Number.MAX_SAFE_INTEGER);
    if (due.length) timer = setTimeout(wake, Math.max(1, Math.min(...due) - Date.now()));
  };
  return { wake, stop: () => { stopped = true; clearTimeout(timer); } };
}
