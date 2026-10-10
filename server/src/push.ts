import { createSign } from 'node:crypto';
import type { Deps } from './authService.ts';
import { noticeKind, SEALED_PREVIEW } from './inbox.ts';
import { isSealed } from './sealed.ts';
import type { InboxKind, RoomMessage } from './types.ts';

const CHANNEL = 'chatx-messages';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

type PushEnv = { projectId: string; clientEmail: string; privateKey: string };

let cachedToken = '';
let tokenUntil = 0;

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

async function accessToken(env: PushEnv) {
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
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!response.ok) return null;
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

async function sendToken(env: PushEnv, token: string, title: string, body: string, data: Record<string, string>) {
  const auth = await accessToken(env);
  if (!auth) return false;
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${env.projectId}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        android: {
          priority: 'HIGH',
          notification: { title, body, channel_id: CHANNEL },
        },
        data,
      },
    }),
  });
  return response.ok;
}

export async function sendMessagePush(deps: Deps, message: RoomMessage & { hints?: import('./sealed.ts').NoticeHints }) {
  const env = pushEnv();
  if (!env) return;
  const members = await deps.repo.listRoomNoticeMembers(message.roomId, message.senderId);
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
    const prefs = await deps.repo.readPushPrefs(member.id);
    if (pushSuppressed(prefs.quiet, prefs.hiddenKinds, message.roomId, kind)) continue;
    const tokens = await deps.repo.listPushTokens(member.id);
    if (tokens.length === 0) continue;
    const title = groupName || senderName || 'ChatX';
    const body = groupName && senderName ? `${senderName}: ${textPreview}` : textPreview;
    const data = {
      conversationId: message.roomId,
      messageId: message.id,
      kind,
    };
    for (const token of tokens) {
      void sendToken(env, token, title, body, data);
    }
  }
}
