export const EVERYONE_HANDLE = 'everyone';

/** Expand a role mention locally before encrypting; only conversation members are eligible. */
export function mentionRecipients(text: string, people: readonly { id: string; username: string; role?: string; customRoleLabel?: string }[]) {
  const names = (person: typeof people[number]) => [person.username, person.customRoleLabel ?? '', ...(person.role === 'admin' ? ['admin'] : person.role === 'creator' ? ['creator', 'المنشئ'] : [])].filter(Boolean);
  const handles = new Set(mentionedHandles(text, [...people.flatMap(names), EVERYONE_HANDLE]));
  return {
    mentions: people.filter((person) => names(person).some((name) => handles.has(name.trim().toLowerCase()))).map((person) => person.id).slice(0, 50),
    everyone: handles.has(EVERYONE_HANDLE),
    signal: text.startsWith('تنبيه'),
  };
}

const ACTIVE = /(^|\s)@([^\n@]*)$/u;
const TOKEN = /^[\p{L}\p{N}_]+/u;

function boundaryBefore(text: string, index: number) {
  return index === 0 || /\s/u.test(text[index - 1] ?? '');
}

function boundaryAfter(text: string, index: number) {
  return index >= text.length || !/^[\p{L}\p{N}_]/u.test(text[index] ?? '');
}

export function mentionHits(text: string, names: readonly string[] = []) {
  const known = [...new Set(names.map((name) => name.trim()).filter(Boolean))].sort((left, right) => right.length - left.length);
  const hits: Array<{ handle: string; start: number; end: number }> = [];
  let index = 0;
  while (index < text.length) {
    const at = text.indexOf('@', index);
    if (at < 0) break;
    if (!boundaryBefore(text, at)) {
      index = at + 1;
      continue;
    }
    const rest = text.slice(at + 1);
    const lower = rest.toLowerCase();
    const match = known.find((name) => {
      const folded = name.toLowerCase();
      return folded.length > 0 && lower.startsWith(folded) && boundaryAfter(rest, folded.length);
    });
    if (match) {
      hits.push({ handle: match.toLowerCase(), start: at, end: at + 1 + match.length });
      index = at + 1 + match.length;
      continue;
    }
    const token = TOKEN.exec(rest);
    if (token) {
      hits.push({ handle: token[0].toLowerCase(), start: at, end: at + 1 + token[0].length });
      index = at + 1 + token[0].length;
      continue;
    }
    index = at + 1;
  }
  return hits;
}

export function mentionPieces(text: string, names: readonly string[] = []) {
  const pieces: Array<{ text: string; handle?: string }> = [];
  let cursor = 0;
  for (const hit of mentionHits(text, names)) {
    if (hit.start > cursor) pieces.push({ text: text.slice(cursor, hit.start) });
    pieces.push({ text: text.slice(hit.start, hit.end), handle: hit.handle });
    cursor = hit.end;
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor) });
  return pieces.filter((piece) => piece.text.length > 0);
}

export function activeMention(value: string, cursor: number) {
  const match = value.slice(0, cursor).match(ACTIVE);
  if (!match) return null;
  return {
    query: match[2],
    start: cursor - match[2].length - 1,
  };
}

export function mentionedHandles(text: string, names: readonly string[] = []) {
  return mentionHits(text, names).map((hit) => hit.handle);
}

export function mentionTone(text: string, username: string) {
  const handles = new Set(mentionedHandles(text, [username, EVERYONE_HANDLE]));
  if (username && handles.has(username.toLowerCase())) return 'direct' as const;
  if (handles.has(EVERYONE_HANDLE)) return 'everyone' as const;
  return null;
}
