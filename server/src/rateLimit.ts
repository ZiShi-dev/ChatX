type RateOptions = {
  limit: number;
  windowMs: number;
  cooldownMs: number;
  now: () => number;
  initial?: ThrottleState;
  onChange?: (state: ThrottleState) => void;
};

export type ThrottleState = {
  failures: Record<string, number[]>;
  cooledUntil: Record<string, number>;
};

function numberList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
}

export function createRateLimiter(options: RateOptions) {
  const failures = new Map<string, number[]>();
  const cooledUntil = new Map<string, number>();
  for (const [key, times] of Object.entries(options.initial?.failures ?? {})) failures.set(key, numberList(times));
  for (const [key, until] of Object.entries(options.initial?.cooledUntil ?? {})) {
    if (typeof until === 'number' && Number.isFinite(until)) cooledUntil.set(key, until);
  }
  const prune = () => {
    const at = options.now();
    for (const [key, times] of failures) {
      const recent = times.filter(time => at - time < options.windowMs).slice(-options.limit);
      if (recent.length) failures.set(key, recent); else failures.delete(key);
    }
    for (const [key, until] of cooledUntil) if (until <= at) cooledUntil.delete(key);
    while (failures.size > 2048) failures.delete(failures.keys().next().value!);
    while (cooledUntil.size > 2048) cooledUntil.delete(cooledUntil.keys().next().value!);
  };
  prune();
  const changed = () => { prune(); options.onChange?.({
    failures: Object.fromEntries(failures),
    cooledUntil: Object.fromEntries(cooledUntil),
  }); };

  return {
    check(key: string) {
      return options.now() >= (cooledUntil.get(key) ?? 0);
    },
    fail(key: string) {
      const now = options.now();
      const recent = (failures.get(key) ?? []).filter((time) => now - time < options.windowMs);
      recent.push(now);
      if (recent.length >= options.limit) {
        cooledUntil.set(key, now + options.cooldownMs);
        failures.set(key, []);
        changed();
        return;
      }
      failures.set(key, recent);
      changed();
    },
    succeed(key: string) {
      const hadFailures = failures.delete(key);
      const hadCooldown = cooledUntil.delete(key);
      if (hadFailures || hadCooldown) changed();
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
