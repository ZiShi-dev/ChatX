import { createSign } from 'node:crypto';
import type { Deps } from './authService.ts';
import { noticeKind, SEALED_PREVIEW } from './inbox.ts';
import { isSealed } from './sealed.ts';
import type { InboxKind, RoomMessage } from './types.ts';
import { deliverPush } from './pushDelivery.ts';
import { pushDeviceId, pushLog } from './pushLog.ts';

const CHANNEL = 'chatx-messages';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

type PushEnv = { projectId: string; clientEmail: string; privateKey: string };

let cachedToken = '';
let tokenUntil = 0;
let tokenScope = '';
let tokenRequest: Promise<string | null> | undefined;

function pushEnv(): PushEnv | null {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() ?? '';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim() ?? '';
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim() ?? '';
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url');
}

export function hasPushConfiguration() { return pushEnv() !== null; }

export async function pushConfigured() {
  const env = pushEnv();
  if (!env) { pushLog('configuration_missing'); return false; }
  try {
    const ready = Boolean(await accessToken(env));
    pushLog('configuration_checked', { ready });
    return ready;
  } catch { pushLog('authentication_failed', { reason: 'credentials_or_network' }); return false; }
}

async function accessToken(env: PushEnv) {
  const scope = env.projectId + ':' + env.clientEmail;
  if (scope !== tokenScope) { cachedToken = ''; tokenUntil = 0; tokenRequest = undefined; tokenScope = scope; }
  if (cachedToken && tokenUntil > Date.now() + 60_000) return cachedToken;
  if (tokenRequest) return tokenRequest;
  const pending = requestAccessToken(env);
  tokenRequest = pending;
  try { return await pending; } finally { if (tokenRequest === pending) tokenRequest = undefined; }
}

async function requestAccessToken(env: PushEnv) {
  const now = Date.now();
  if (cachedToken && tokenUntil > now + 60_000) return cachedToken;
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({
    iss: env.clientEmail,
    sub: env.clientEmail,
    aud: TOKEN_URL,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 3600,
    scope: FCM_SCOPE,
  }));
  const unsigned = `${header}.${claim}`;
  const sign = createSign('RSA-SHA256');
  sign.update(unsigned);
  sign.end();
  const signature = sign.sign(env.privateKey).toString('base64url');
  const assertion = `${unsigned}.${signature}`;
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!response.ok) { pushLog('oauth_rejected', { httpStatus: response.status }); return null; }
  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) return null;
  cachedToken = payload.access_token;
  tokenUntil = now + (payload.expires_in ?? 3600) * 1000;
  return cachedToken;
}

export function pushSuppressed(quiet: string, hiddenKinds: string, conversationId: string, kind: InboxKind) {
  if (hiddenKinds) {
    for (const item of hiddenKinds.split(',')) {
      if (kind === item) return true;
    }
  }
  if (!quiet || !conversationId) return false;
  let level = '';
  for (const item of quiet.split(',')) {
    const mark = item.indexOf('=');
    if (mark > 0 && conversationId === item.slice(0, mark)) level = item.slice(mark + 1);
  }
  if (level === 'none') return true;
  if (level === 'mentions') return kind !== 'mention' && kind !== 'reply';
  if (level === 'everyone') return kind !== 'everyone' && kind !== 'mention';
  if (level.startsWith('off:')) {
    const blocked = `.${level.slice(4)}.`;
    return blocked.includes(`.${kind}.`);
  }
  return false;
}

async function sendToken(env: PushEnv, token: string, title: string, body: string, data: Record<string, string>, stillAllowed: () => Promise<boolean>, dataOnly = false) {
  const context = { messageId: data.messageId, conversationId: data.conversationId, kind: data.kind, deviceId: pushDeviceId(token), payload: dataOnly ? 'data' : 'notification' };
  let attempt = 0;
  const response = await deliverPush(async () => {
    attempt++;
    pushLog('send_attempt', { ...context, attempt });
    try {
    const auth = await accessToken(env);
    if (!auth) throw new Error('push_auth_unavailable');
    const result = await fetch(`https://fcm.googleapis.com/v1/projects/${env.projectId}/messages:send`, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        android: {
          priority: 'HIGH',
          ttl: '86400s',
          ...(!dataOnly ? { notification: {
            title,
            body,
            channel_id: CHANNEL,
            tag: data.conversationId,
            notification_priority: 'PRIORITY_HIGH',
            visibility: 'PUBLIC',
            default_sound: true,
            default_vibrate_timings: true,
          } } : {}),
        },
        data: { ...data, title, body },
      },
    }),
    });
    if (result.status === 401) { cachedToken = ''; tokenUntil = 0; }
    const details = await result.clone().json().catch(() => null) as { error?: { status?: string; details?: Array<{ errorCode?: string }> }; name?: string } | null;
    pushLog(result.ok ? 'fcm_accepted' : 'fcm_rejected', {
      ...context, attempt, httpStatus: result.status,
      fcmMessageName: result.ok ? details?.name : undefined,
      errorCode: details?.error?.details?.map(item => item.errorCode).filter(Boolean).join(',') || details?.error?.status,
      // Acceptance by Firebase is not an acknowledgement from the phone.
      phoneDisplayConfirmed: false,
    });
    return result;
    } catch (error) {
      pushLog('send_error', { ...context, attempt, reason: error instanceof Error && error.message === 'push_auth_unavailable' ? 'authentication_unavailable' : 'credentials_or_network' });
      throw error;
    }
  }, stillAllowed);
  if (!response) { pushLog('delivery_stopped', context); return 'failed'; }
  if (response.ok) return 'sent';
  const error = await response.json().catch(() => null) as { error?: { details?: Array<{ errorCode?: string }> } } | null;
  console.warn('[push] FCM rejected delivery', response.status, error?.error?.details?.map(item => item.errorCode).filter(Boolean).join(',') || 'unknown');
  return error?.error?.details?.some(item => item.errorCode === 'UNREGISTERED') ? 'expired' : 'failed';
}

export async function sendMessagePush(deps: Deps, message: RoomMessage & { hints?: import('./sealed.ts').NoticeHints }) {
  try { await dispatchMessagePush(deps, message); }
  catch { pushLog('dispatch_failed', { messageId: message.id, conversationId: message.roomId }); }
}

async function dispatchMessagePush(deps: Deps, message: RoomMessage & { hints?: import('./sealed.ts').NoticeHints }) {
  const env = pushEnv();
  const context = { messageId: message.id, conversationId: message.roomId };
  pushLog('message_triggered', context);
  if (!env) { pushLog('dispatch_skipped', { ...context, reason: 'configuration_missing' }); return; }
  const members = await deps.repo.listRoomNoticeMembers(message.roomId, message.senderId);
  pushLog('recipients_found', { ...context, count: members.length });
  if (members.length === 0) return;
  const parent = message.replyToId
    ? await deps.repo.findRoomMessage(message.roomId, message.replyToId)
    : null;
  const room = await deps.repo.readRoomLabel(message.roomId);
  const sender = await deps.repo.findUserById(message.senderId);
  const senderName = sender?.displayName ?? '';
  const groupName = room?.name ?? '';
  const flat = message.text.replace(/\s+/g, ' ').trim();
  const textPreview = message.imageSize ? 'صورة' : message.fileName ? message.fileName
    : isSealed(message.text) ? SEALED_PREVIEW : flat.length <= 80 ? flat : `${flat.slice(0, 80)}…`;
  for (const member of members) {
    const kind = noticeKind(message, member, parent?.senderId === member.id);
    const recipient = { ...context, userId: member.id, kind };
    if (kind !== 'mention' && kind !== 'everyone' && kind !== 'reply' && kind !== 'message') { pushLog('recipient_skipped', { ...recipient, reason: 'inbox_only_kind' }); continue; }
    const prefs = await deps.repo.readPushPrefs(member.id);
    if (pushSuppressed(prefs.quiet, prefs.hiddenKinds, message.roomId, kind)) { pushLog('recipient_skipped', { ...recipient, reason: 'muted_or_disabled' }); continue; }
    const tokens = await deps.repo.listPushTokens(member.id);
    if (tokens.length === 0) { pushLog('recipient_skipped', { ...recipient, reason: 'no_registered_device' }); continue; }
    pushLog('recipient_queued', { ...recipient, deviceCount: tokens.length });
    const devices = deps.repo.listPushDevices ? await deps.repo.listPushDevices(member.id) : [];
    const label = kind === 'mention' ? 'إشارة إليك' : kind === 'everyone' ? 'إشارة للجميع' : kind === 'reply' ? 'رد على رسالتك' : '';
    const title = (groupName || senderName || 'ChatX') + (label ? ` · ${label}` : '');
    const body = groupName && senderName ? `${senderName}: ${textPreview}` : textPreview;
    const data = {
      conversationId: message.roomId,
      messageId: message.id,
      kind: String(kind),
      conversationType: room?.kind ?? 'group',
      createdAt: message.createdAt.toISOString(),
      senderName,
      conversationName: groupName,
      preview: textPreview,
      // Keep FCM below its 4 KB payload limit; never expose plaintext to the server.
      ...(isSealed(message.text) && Buffer.byteLength(message.text, 'utf8') <= 2000 ? { sealed: message.text } : {}),
    };
    for (const token of tokens) {
      const stillAllowed = async () => {
        const retryContext = { ...recipient, deviceId: pushDeviceId(token) };
        const latestPrefs = await deps.repo.readPushPrefs(member.id);
        if (pushSuppressed(latestPrefs.quiet, latestPrefs.hiddenKinds, message.roomId, kind)) { pushLog('retry_cancelled', { ...retryContext, reason: 'muted_or_disabled' }); return false; }
        if (!(await deps.repo.listPushTokens(member.id)).includes(token)) { pushLog('retry_cancelled', { ...retryContext, reason: 'device_unregistered' }); return false; }
        const notices = await deps.repo.listNotifications(member.id, 100, null);
        const allowed = notices.some(notice => notice.messageId === message.id && notice.roomId === message.roomId && !notice.read && !notice.deleted);
        if (!allowed) pushLog('retry_cancelled', { ...retryContext, reason: 'notification_read_deleted_or_missing' });
        return allowed;
      };
      void sendToken(env, token, title, body, data, stillAllowed, devices.some(device => device.token === token && device.platform === 'android-data-v1')).then(result => {
        pushLog('delivery_finished', { ...recipient, deviceId: pushDeviceId(token), result });
        if (result === 'expired') return deps.repo.deletePushToken(member.id, token);
      }).catch(() => { pushLog('delivery_failed', { ...recipient, deviceId: pushDeviceId(token) }); });
    }
  }
}
