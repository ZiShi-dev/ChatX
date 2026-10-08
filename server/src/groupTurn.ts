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
  const members = [...new Set(input.members)];
  if (!members.includes(input.actorId)) return { ok: false };
  if (members.length <= 1) return { ok: true, holderId: input.actorId, opensAt: input.now, round: 1, done: [] };
  const round = input.round > 0 ? input.round : 1;
  const done = input.done.filter((id) => members.includes(id));
  const holderId = input.holderId && members.includes(input.holderId) ? input.holderId : null;
  const opensAt = Number.isFinite(input.opensAt) ? input.opensAt : input.now;
  if (!holderId || input.now < opensAt || holderId !== input.actorId) return { ok: false };
  if (!input.changedIdentity) return { ok: true, holderId, opensAt, round, done };
  const passed = done.includes(input.actorId) ? done : [...done, input.actorId];
  let pool = members.filter((id) => !passed.includes(id));
  let nextRound = round;
  let nextDone = passed;
  if (pool.length === 0) {
    nextRound = round + 1;
    nextDone = [];
    pool = members.filter((id) => id !== input.actorId);
    if (pool.length === 0) pool = members;
  }
  return {
    ok: true,
    holderId: pool[pickIndex(pool.length, input.random)] ?? input.actorId,
    opensAt: input.now + GROUP_TURN_MS,
    round: nextRound,
    done: nextDone,
  };
}
