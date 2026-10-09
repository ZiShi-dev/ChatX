export const GROUP_TURN_MS = 7 * 24 * 60 * 60 * 1000;

export function groupTurnNotice(name: string, opensAt: number, now: number) {
  const who = name.trim() || 'عضو';
  const base = `دور ${who} لتعديل اسم المجموعة وصورتها`;
  if (Number.isFinite(opensAt) && opensAt > now) {
    const date = new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long', numberingSystem: 'latn' }).format(opensAt);
    return `${base} في ${date}`.slice(0, 400);
  }
  return base.slice(0, 400);
}

export function pickIndex(length: number, random: (length: number) => number) {
  if (length <= 1) return 0;
  const index = random(length);
  if (!Number.isInteger(index) || index < 0 || index >= length) return 0;
  return index;
}

type TurnInput = {
  members: string[]; holderId: string | null; opensAt: number; round: number;
  done: string[]; now: number; random: (length: number) => number;
};

/** Resolve elapsed weeks independently of edits; keep the original weekly boundaries. */
export function resolveGroupTurn(input: TurnInput) {
  const members = [...new Set(input.members)];
  if (!members.length) return null;
  if (members.length === 1) return { holderId: members[0]!, opensAt: input.now, round: 1, done: [] };
  let round = input.round > 0 ? input.round : 1;
  let done = [...new Set(input.done.filter((id) => members.includes(id)))];
  let holderId = input.holderId && members.includes(input.holderId) ? input.holderId : null;
  let opensAt = Number.isFinite(input.opensAt) && input.opensAt > 0 ? input.opensAt : input.now;
  if (!holderId) {
    let pool = members.filter((id) => !done.includes(id));
    if (!pool.length) { pool = members; done = []; round += 1; }
    holderId = pool[pickIndex(pool.length, input.random)]!;
    opensAt = input.now;
  }
  while (input.now >= opensAt + GROUP_TURN_MS) {
    const previous = holderId;
    done = [...new Set([...done, previous])];
    let pool = members.filter((id) => !done.includes(id));
    if (!pool.length) {
      round += 1;
      done = [];
      pool = members.filter((id) => id !== previous);
    }
    holderId = pool[pickIndex(pool.length, input.random)]!;
    opensAt += GROUP_TURN_MS;
  }
  return { holderId, opensAt, round, done };
}

export function advanceGroupTurn(input: {
  members: string[];
  holderId: string | null;
  opensAt: number;
  round: number;
  done: string[];
  actorId: string;
  now: number;
  changedIdentity: boolean;
  random: (length: number) => number;
}): { ok: true; holderId: string; opensAt: number; round: number; done: string[] } | { ok: false } {
  if (!input.members.includes(input.actorId)) return { ok: false };
  const turn = resolveGroupTurn(input);
  if (!turn || turn.holderId !== input.actorId || input.now < turn.opensAt) return { ok: false };
  return { ok: true, ...turn };
}
