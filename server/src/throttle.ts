import type { Pool } from 'pg';
import type { ThrottleState } from './rateLimit.ts';

const EMPTY: ThrottleState = { failures: {}, cooledUntil: {} };

function numberRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]));
  return Object.fromEntries(entries);
}

function listRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = Object.entries(value).flatMap(([key, item]) => {
    if (!Array.isArray(item)) return [];
    const times = item.filter((time): time is number => typeof time === 'number' && Number.isFinite(time));
    return [[key, times] as const];
  });
  return Object.fromEntries(entries);
}

export async function loadThrottle(pool: Pool): Promise<ThrottleState> {
  const result = await pool.query<{ state: unknown }>('SELECT state FROM auth_throttle WHERE id = true');
  const state = result.rows[0]?.state;
  if (!state || typeof state !== 'object' || Array.isArray(state)) return EMPTY;
  const data = state as { failures?: unknown; cooledUntil?: unknown };
  return { failures: listRecord(data.failures), cooledUntil: numberRecord(data.cooledUntil) };
}

export function saveThrottle(pool: Pool, state: ThrottleState) {
  void pool.query(
    `INSERT INTO auth_throttle (id, state) VALUES (true, $1::jsonb)
     ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state`,
    [JSON.stringify(state)],
  ).catch(() => undefined);
}
