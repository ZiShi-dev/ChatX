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
  const changed = () => options.onChange?.({
    failures: Object.fromEntries(failures),
    cooledUntil: Object.fromEntries(cooledUntil),
  });

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
      failures.delete(key);
      cooledUntil.delete(key);
      changed();
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
