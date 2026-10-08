import { readDirectoryUser } from './directory';

export function readGooglePreview(payload: unknown): { name: string; picture: string } | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, unknown>;
  if (data.step !== 'profile') return null;
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const picture = typeof data.picture === 'string' && data.picture.startsWith('https://') ? data.picture : '';
  return { name, picture };
}

export function readGoogleReadyUser(payload: unknown) {
  if (!payload || typeof payload !== 'object' || (payload as { step?: unknown }).step !== 'ready') return null;
  return readDirectoryUser((payload as { user?: unknown }).user);
}
