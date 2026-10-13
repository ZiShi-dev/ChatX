import { createHash } from 'node:crypto';

/** Never include message contents, credentials or complete device tokens. */
export function pushDeviceId(token: string) {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

export function pushLog(event: string, fields: Record<string, string | number | boolean | undefined> = {}) {
  if (process.env.CHATX_PUSH_LOGS === 'false') return;
  console.log('[push]', JSON.stringify({ time: new Date().toISOString(), event, ...fields }));
}
