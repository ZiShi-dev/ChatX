import { randomUUID } from 'node:crypto';
import type { AppConfig } from './config.ts';
import { verifyGoogleIdToken } from './google.ts';
import { visiblePresence } from './presence.ts';
import { cleanAccentColor, cleanAvatar, cleanBanner, cleanBio, cleanMessageFont } from './profile.ts';
import { createRateLimiter, type RateLimiter, type ThrottleState } from './rateLimit.ts';
import { hashSession, newSessionToken } from './session.ts';
import { ERASE_OPERATOR_EMAIL, resolveEraseChoices, resolveGroupChoices } from './eraseMember.ts';
import type { AuthRepository, AuthUser, ProfilePatch } from './types.ts';

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export type Deps = {
  repo: AuthRepository;
  config: AppConfig;
  now: () => number;
  rateLimit: RateLimiter;
};

type Failure = { ok: false; error: 'invalid_credentials' | 'rate_limited' | 'unavailable' | 'forbidden' | 'username_taken' };

function blocked(deps: Deps, ip: string) {
  if (deps.rateLimit.check(ip)) return null;
  return { ok: false as const, error: 'rate_limited' as const };
}

function reject(deps: Deps, ip: string): Failure {
  deps.rateLimit.fail(ip);
  return { ok: false, error: 'invalid_credentials' };
}

function cleanName(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);
}

function publicUser(user: AuthUser) {
  return {
    id: user.id,
    displayName: user.displayName,
    username: user.username,
    role: user.role,
    bio: user.bio,
    ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    ...(user.bannerUrl ? { bannerUrl: user.bannerUrl } : {}),
    ...(user.accentColor ? { color: user.accentColor } : {}),
    ...(user.messageFont && user.messageFont !== 'system' ? { messageFont: user.messageFont } : {}),
  };
}

async function openSession(deps: Deps, userId: string) {
  const token = newSessionToken();
  await deps.repo.createSession(hashSession(token), userId, new Date(deps.now() + SESSION_MS));
  return token;
}

async function googleIdentity(deps: Deps, credential: unknown) {
  if (!deps.config.googleClientId) return { ok: false as const, error: 'unavailable' as const };
  if (typeof credential !== 'string' || !credential.trim()) return { ok: false as const, error: 'invalid_credentials' as const };
  try {
    const identity = await verifyGoogleIdToken(credential.trim(), deps.config.googleClientId, deps.now());
    return identity ? { ok: true as const, identity } : { ok: false as const, error: 'invalid_credentials' as const };
  } catch {
    return { ok: false as const, error: 'unavailable' as const };
  }
}

async function googleMember(deps:Deps,email:string,sub:string):Promise<AuthUser | 'forbidden' | null> {
  const bound=await deps.repo.findUserByGoogleSub(sub);
  if(bound)return bound;
  const existing=(await deps.repo.listUsers()).find((user)=>user.email.toLowerCase()===email.toLowerCase());
  if(!existing)return null;
  if(!await deps.repo.bindGoogleSub(existing.id,sub))return 'forbidden';
  return {...existing,googleSub:sub};
}

export async function resumeMember(deps: Deps, email: string, sub?:string) {
  const existing = sub ? await googleMember(deps,email,sub) : (await deps.repo.listUsers()).find((user) => user.email.toLowerCase() === email.toLowerCase());
  if(existing==='forbidden')return {ok:false as const,error:'forbidden' as const};
  if (!existing) return { ok: true as const, step: 'profile' as const };
  if (existing.role !== 'member') return { ok: false as const, error: 'forbidden' as const };
  return { ok: true as const, step: 'ready' as const, user: publicUser(existing), sessionToken: await openSession(deps, existing.id) };
}

export async function previewGoogle(deps: Deps, input: { credential?: unknown; ip: string }) {
  const limit = blocked(deps, input.ip);
  if (limit) return limit;
  const checked = await googleIdentity(deps, input.credential);
  if (!checked.ok) return checked.error === 'unavailable' ? checked : reject(deps, input.ip);
  const resumed = await resumeMember(deps, checked.identity.email,checked.identity.sub);
  if (!resumed.ok) return resumed;
  deps.rateLimit.succeed(input.ip);
  if (resumed.step === 'ready') return resumed;
  return { ok: true as const, step: 'profile' as const, name: checked.identity.name, picture: checked.identity.picture };
}

export async function acceptGoogle(deps: Deps, input: { credential?: unknown; displayName?: unknown; ip: string }) {
  const limit = blocked(deps, input.ip);
  if (limit) return limit;
  const checked = await googleIdentity(deps, input.credential);
  if (!checked.ok) return checked.error === 'unavailable' ? checked : reject(deps, input.ip);
  const displayName = cleanName(input.displayName) || cleanName(checked.identity.name);
  if (displayName.length < 2) return { ok: false as const, error: 'invalid_credentials' as const };
  const users = await deps.repo.listUsers();
  const existing = await googleMember(deps,checked.identity.email,checked.identity.sub);
  if(existing==='forbidden')return {ok:false as const,error:'forbidden' as const};
  if (existing && existing.role !== 'member') return { ok: false as const, error: 'forbidden' as const };
  if (existing) {
    if (existing.displayName !== displayName) {
      const renamed = await deps.repo.renameMember(existing.id, displayName);
      if (renamed === 'taken') return { ok: false as const, error: 'username_taken' as const };
      if (renamed !== 'ok') return reject(deps, input.ip);
    }
    const user = await deps.repo.findUserById(existing.id);
    if (!user) return reject(deps, input.ip);
    deps.rateLimit.succeed(input.ip);
    return { ok: true as const, step: 'ready' as const, user: publicUser(user), sessionToken: await openSession(deps, user.id) };
  }
  if (users.some((user) => user.username.toLowerCase() === displayName.toLowerCase())) {
    return { ok: false as const, error: 'username_taken' as const };
  }
  const user: AuthUser = {
    id: randomUUID(),
    email: checked.identity.email,
    displayName,
    username: displayName,
    role: 'member',
    bio: '',
    bannerUrl: null,
    avatarUrl: null,
    googleSub:checked.identity.sub,
  };
  try {
    await deps.repo.insertUser(user);
  } catch {
    return reject(deps, input.ip);
  }
  deps.rateLimit.succeed(input.ip);
  return { ok: true as const, step: 'ready' as const, user: publicUser(user), sessionToken: await openSession(deps, user.id) };
}

async function sessionUser(deps: Deps, token: string) {
  if (!token) return null;
  return deps.repo.findSessionUser(hashSession(token), new Date(deps.now()));
}

export async function reportPresence(deps: Deps, input: { token: string; status: unknown }) {
  if (input.status !== 'online' && input.status !== 'away') return { ok: false as const, error: 'invalid_credentials' as const };
  const user = await sessionUser(deps, input.token);
  if (!user) return { ok: false as const, error: 'invalid_credentials' as const };
  const touched = await deps.repo.touchPresence(hashSession(input.token), input.status, new Date(deps.now()));
  if (!touched) return { ok: false as const, error: 'invalid_credentials' as const };
  return { ok: true as const };
}

export async function readPresence(deps: Deps, token: string) {
  const user = await sessionUser(deps, token);
  if (!user) return { ok: false as const, error: 'invalid_credentials' as const };
  const now = deps.now();
  const rows = await deps.repo.listPresence(new Date(now));
  return {
    ok: true as const,
    users: rows.map((row) => ({ id: row.id, ...visiblePresence(row, now) })),
  };
}

export async function readOwnProfile(deps: Deps, token: string) {
  const user = await sessionUser(deps, token);
  if (!user) return { ok: false as const, error: 'invalid_credentials' as const };
  return { ok: true as const, user: publicUser(user) };
}

export async function updateOwnProfile(deps: Deps, input: {
  token: string;
  displayName?: unknown;
  bio?: unknown;
  banner?: unknown;
  avatar?: unknown;
  hasDisplayName: boolean;
  hasBio: boolean;
  hasBanner: boolean;
  hasAvatar: boolean;
  hasColor: boolean;
  hasMessageFont: boolean;
  color?: unknown;
  messageFont?: unknown;
  ip: string;
}) {
  const limit = blocked(deps, input.ip);
  if (limit) return limit;
  if (!input.token || (!input.hasDisplayName && !input.hasBio && !input.hasBanner && !input.hasAvatar && !input.hasColor && !input.hasMessageFont)) {
    return { ok: false as const, error: 'invalid_credentials' as const };
  }
  const user = await sessionUser(deps, input.token);
  if (!user) return reject(deps, input.ip);
  if (user.role !== 'member') return { ok: false as const, error: 'forbidden' as const };
  const patch: ProfilePatch = {};
  if (input.hasDisplayName) {
    const displayName = cleanName(input.displayName);
    if (displayName.length < 2) return { ok: false as const, error: 'invalid_credentials' as const };
    patch.displayName = displayName;
  }
  if (input.hasBio) {
    const bio = cleanBio(input.bio);
    if (bio === null) return { ok: false as const, error: 'invalid_credentials' as const };
    patch.bio = bio;
  }
  if (input.hasBanner) {
    const banner = cleanBanner(input.banner);
    if (!banner.ok) return { ok: false as const, error: 'invalid_credentials' as const };
    patch.banner = banner.value;
  }
  if (input.hasAvatar) {
    const avatar = cleanAvatar(input.avatar);
    if (!avatar.ok) return { ok: false as const, error: 'invalid_credentials' as const };
    patch.avatar = avatar.value;
  }
  if (input.hasColor) {
    const color = cleanAccentColor(input.color);
    if (!color.ok) return { ok: false as const, error: 'invalid_credentials' as const };
    patch.color = color.value;
  }
  if (input.hasMessageFont) {
    const font = cleanMessageFont(input.messageFont);
    if (!font.ok) return { ok: false as const, error: 'invalid_credentials' as const };
    patch.messageFont = font.value;
  }
  const updated = await deps.repo.updateMemberProfile(user.id, patch);
  if (updated === 'taken') return { ok: false as const, error: 'username_taken' as const };
  if (updated !== 'ok') return reject(deps, input.ip);
  const fresh = await deps.repo.findUserById(user.id);
  if (!fresh) return reject(deps, input.ip);
  deps.rateLimit.succeed(input.ip);
  return { ok: true as const, user: publicUser(fresh) };
}

function ownerEmail(email: string) {
  return email.toLowerCase() === ERASE_OPERATOR_EMAIL;
}

function ownerAccount(user: { email: string; googleSub?: string | null }) {
  return ownerEmail(user.email) && typeof user.googleSub === 'string' && user.googleSub.length > 0 && user.googleSub.length <= 255;
}

export async function listOwnerMembers(deps: Deps, token: string) {
  const user = await sessionUser(deps, token);
  if (!user) return { ok: false as const, error: 'invalid_credentials' as const };
  if (!ownerAccount(user)) return { ok: false as const, error: 'forbidden' as const };
  const users = await deps.repo.listUsers();
  return {
    ok: true as const,
    users: users
      .filter((item) => item.id !== user.id && !ownerEmail(item.email))
      .map(publicUser),
    groups: await deps.repo.listOwnerGroups(),
  };
}

export async function eraseOwnerMember(deps: Deps, input: { token: string; userId: unknown; choices: unknown }) {
  const user = await sessionUser(deps, input.token);
  if (!user) return { ok: false as const, error: 'invalid_credentials' as const };
  if (!ownerAccount(user)) return { ok: false as const, error: 'forbidden' as const };
  const choices = resolveEraseChoices(input.choices);
  if (typeof input.userId !== 'string' || !choices) {
    return { ok: false as const, error: 'invalid_credentials' as const };
  }
  const result = await deps.repo.eraseMember(user.id, input.userId, choices);
  if (result === 'ok') return { ok: true as const };
  if (result === 'forbidden') return { ok: false as const, error: 'forbidden' as const };
  return { ok: false as const, error: 'not_found' as const };
}

export async function eraseOwnerGroup(deps: Deps, input: { token: string; roomId: unknown; choices: unknown }) {
  const user = await sessionUser(deps, input.token);
  if (!user) return { ok: false as const, error: 'invalid_credentials' as const };
  if (!ownerAccount(user)) return { ok: false as const, error: 'forbidden' as const };
  const choices = resolveGroupChoices(input.choices);
  if (typeof input.roomId !== 'string' || !choices) {
    return { ok: false as const, error: 'invalid_credentials' as const };
  }
  const result = await deps.repo.eraseGroup(user.id, input.roomId, choices);
  if (result === 'ok') return { ok: true as const };
  if (result === 'forbidden') return { ok: false as const, error: 'forbidden' as const };
  return { ok: false as const, error: 'not_found' as const };
}

export async function endSession(deps: Deps, token: string) {
  if (token) await deps.repo.deleteSession(hashSession(token));
}

export function createLimiter(config: AppConfig, now: () => number, hooks?: { initial?: ThrottleState; onChange?: (state: ThrottleState) => void }) {
  return createRateLimiter({
    limit: config.authRateLimit,
    windowMs: config.authRateWindowMs,
    cooldownMs: config.authCooldownMs,
    now,
    initial: hooks?.initial,
    onChange: hooks?.onChange,
  });
}
