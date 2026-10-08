import type { InviteCode } from '../types/invite';
import type { User } from '../types/user';

export type InviteAccess = 'unknown' | 'inactive' | 'new' | 'return';

const ACCOUNT_COLORS = ['#4d7ea8', '#a56b7a', '#c4893a', '#6f8f72', '#5f8f8a'];

export type AccountDraft = {
  displayName: string;
  username: string;
  avatarUrl?: string;
};

export type SignInResult =
  | { ok: true; user: User; invites: InviteCode[]; accounts: User[] }
  | { ok: false; reason: 'unknown' | 'inactive' | 'missing-profile' };

export function inviteAccess(invites: Pick<InviteCode, 'code' | 'isActive' | 'usedBy'>[], code: string): InviteAccess {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return 'unknown';
  const match = invites.find((invite) => invite.code.toUpperCase() === normalized);
  if (!match) return 'unknown';
  if (!match.isActive) return 'inactive';
  return match.usedBy ? 'return' : 'new';
}

export function signInWithCode(
  invites: InviteCode[],
  accounts: User[],
  code: string,
  draft?: AccountDraft,
  nextId: () => string = () => crypto.randomUUID(),
): SignInResult {
  const access = inviteAccess(invites, code);
  if (access === 'unknown' || access === 'inactive') return { ok: false, reason: access };
  const match = invites.find((invite) => invite.code.toUpperCase() === code.trim().toUpperCase());
  if (!match) return { ok: false, reason: 'unknown' };
  if (match.usedBy) {
    const user = accounts.find((account) => account.id === match.usedBy);
    if (!user) return { ok: false, reason: 'unknown' };
    return { ok: true, user, invites, accounts };
  }
  const displayName = draft?.displayName.trim() ?? '';
  if (displayName.length < 2 || !draft?.username) return { ok: false, reason: 'missing-profile' };
  const user: User = {
    id: nextId(),
    username: draft.username,
    displayName,
    role: 'member',
    status: 'online',
    bio: '',
    color: ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length],
    ...(draft.avatarUrl ? { avatarUrl: draft.avatarUrl } : {}),
  };
  return {
    ok: true,
    user,
    accounts: [...accounts, user],
    invites: invites.map((invite) => (invite.id === match.id ? { ...invite, usedBy: user.id } : invite)),
  };
}
