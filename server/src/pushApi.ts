import type { Deps } from './authService.ts';
import { hashSession } from './session.ts';

const TOKEN = /^[A-Za-z0-9:_-]{20,4096}$/;

async function sessionUser(deps: Deps, token: string | undefined) {
  if (!token) return null;
  return deps.repo.findSessionUser(hashSession(token), new Date(deps.now()));
}

export async function registerPushToken(deps: Deps, token: string | undefined, platform: string | undefined, session: string | undefined) {
  const user = await sessionUser(deps, session);
  if (!user || typeof token !== 'string' || !TOKEN.test(token)) return { ok: false as const, error: 'invalid_credentials' as const };
  const safePlatform = platform === 'ios' ? 'ios' : 'android';
  await deps.repo.savePushToken(user.id, token, safePlatform);
  return { ok: true as const };
}

export async function unregisterPushToken(deps: Deps, token: string | undefined, session: string | undefined) {
  const user = await sessionUser(deps, session);
  if (!user || typeof token !== 'string' || !TOKEN.test(token)) return { ok: false as const, error: 'invalid_credentials' as const };
  await deps.repo.deletePushToken(user.id, token);
  return { ok: true as const };
}

export async function savePushPrefs(deps: Deps, quiet: string | undefined, hiddenKinds: string | undefined, session: string | undefined) {
  const user = await sessionUser(deps, session);
  if (!user) return { ok: false as const, error: 'invalid_credentials' as const };
  const safeQuiet = typeof quiet === 'string' && quiet.length <= 4000 ? quiet : '';
  const safeHidden = typeof hiddenKinds === 'string' && hiddenKinds.length <= 400 ? hiddenKinds : '';
  await deps.repo.savePushPrefs(user.id, safeQuiet, safeHidden);
  return { ok: true as const };
}
