import { compressJson } from './compression.ts';
import { createRequestBudget } from './requestBudget.ts';
import { handleTransfer } from './transfer.ts';
import { createHash } from 'node:crypto';
import {
  acceptGoogle,
  endSession,
  eraseOwnerGroup,
  eraseOwnerMember,
  listOwnerMembers,
  previewGoogle,
  readOwnProfile,
  readPresence,
  reportPresence,
  updateOwnProfile,
  type Deps,
} from './authService.ts';
import { messageView, openRoom, postRoomMessage, readHome, readGroupTurn, readRoomFile, readRoomImage, readRoomMessages, setRoomReaction, markRoomSeen, changeMessage, updateRoomProfile, dropOrphanPrivate } from './home.ts';
import { keepMessage, readSaved } from './saved.ts';
import { addRoomKeys, readKeys, readRoomKeys, saveKeys } from './keys.ts';
import { clearInbox, markInboxRead, readInbox } from './inbox.ts';
import { registerPushToken, savePushPrefs, unregisterPushToken } from './pushApi.ts';
import { clearSessionCookie, hashSession, readCookie, sessionCookie } from './session.ts';
import { armRoomWatch, LIVE_HOLD_MS } from './roomLive.ts';
import { publishTyping, roomTyping } from './typing.ts';
import { cachedLinkCard } from './linkPreview.ts';

const PROFILE_BODY_LIMIT = 280_000;
const MESSAGE_BODY_LIMIT = 400_000;

const NATIVE_APP_ORIGIN = 'https://localhost';
const DEV_HTTP_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(:\d{1,5})?$/;

function trustedOrigin(origin: string, deps: Deps) {
  if (origin === NATIVE_APP_ORIGIN || origin === deps.config.corsOrigin) return true;
  return deps.config.allowDevOrigins && DEV_HTTP_ORIGIN.test(origin);
}

function statusFor(error: string) {
  if (error === 'rate_limited') return 429;
  if (error === 'forbidden') return 403;
  if (error === 'not_found') return 404;
  if (error === 'username_taken' || error === 'key_exists') return 409;
  if (error === 'invalid') return 400;
  if (error === 'unavailable') return 503;
  return 401;
}

function requestBodyLimit(path: string) {
  if (path === '/api/profile') return PROFILE_BODY_LIMIT;
  if (/^\/api\/rooms\/[0-9a-f-]{36}$/i.test(path)) return PROFILE_BODY_LIMIT;
  if (/^\/api\/rooms\/[0-9a-f-]{36}\/keys$/i.test(path)) return 40_000;
  if (/^\/api\/rooms\/[0-9a-f-]{36}\/messages\/[0-9a-f-]{36}$/i.test(path)) return 24_000;
  if (/^\/api\/rooms\/[0-9a-f-]{36}\/messages$/i.test(path)) return MESSAGE_BODY_LIMIT;
  return 4096;
}

function bytesBody(bytes: Uint8Array) {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return body;
}

function attachmentName(name: string) {
  const ascii = name.replace(/[^\w.\- ]+/g, '_').slice(0, 80) || 'file';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function jpeg(bytes: Uint8Array) {
  const headers = new Headers();
  securityHeaders(headers);
  headers.set('content-type', 'image/jpeg');
  headers.set('cache-control', 'private, max-age=86400');
  headers.set('vary', 'Cookie');
  return new Response(bytesBody(bytes), { status: 200, headers });
}

function download(name: string, bytes: Uint8Array) {
  const headers = new Headers();
  securityHeaders(headers);
  headers.set('content-type', 'application/octet-stream');
  headers.set('content-disposition', attachmentName(name));
  headers.set('cache-control', 'private, max-age=86400');
  headers.set('vary', 'Cookie');
  return new Response(bytesBody(bytes), { status: 200, headers });
}

function json(body: unknown, status = 200, extra?: { retryAfter?: number }) {
  const headers = new Headers();
  securityHeaders(headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  if (extra?.retryAfter) headers.set('retry-after', String(extra.retryAfter));
  return new Response(JSON.stringify(body), { status, headers });
}

export function securityHeaders(headers: Headers) {
  headers.set('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
  headers.set('x-frame-options', 'DENY');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('permissions-policy', 'microphone=(), geolocation=(), payment=()');
}

function clientIp(request: Request) {
  return request.headers.get('x-chatx-client')?.slice(0, 64) || 'local';
}

function secureRequest(request: Request) {
  return request.headers.get('x-chatx-secure') === '1';
}

async function readBody(request: Request, limit: number) {
  if (request.method === 'GET' || request.method === 'HEAD') return {};
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > limit) return null;
  if (!text) return {};
  try {
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

function failure(deps: Deps, error: string) {
  return json({ error }, statusFor(error), error === 'rate_limited' ? { retryAfter: Math.ceil(deps.config.authCooldownMs / 1000) } : undefined);
}

function allowedOrigin(origin: string | null, deps: Deps) {
  if (!origin || !trustedOrigin(origin, deps)) return null;
  return origin;
}

function withCors(request: Request, response: Response, origin: string | null) {
  if (!origin || request.headers.get('origin') !== origin) return response;
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-credentials', 'true');
  headers.set('access-control-expose-headers', 'etag, date, retry-after');
  headers.append('vary', 'Origin');
  if (request.headers.get('access-control-request-private-network') === 'true') {
    headers.set('access-control-allow-private-network', 'true');
  }
  return new Response(response.body, { status: response.status, headers });
}

async function route(deps: Deps, request: Request) {
  const path = new URL(request.url).pathname;
  if (request.method === 'OPTIONS') {
    const headers = new Headers({
      'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'access-control-allow-headers': 'content-type, x-chatx-request, if-none-match',
      'access-control-max-age': '600',
    });
    securityHeaders(headers);
    return new Response(null, { status: 204, headers });
  }
  if (request.method === 'GET' && path === '/api/health') return json({ ok: true, groupTurnPolicy: 'weekly-v3-direct', networkPolicy: 'durable-delta-v1', securityPolicy:'bounded-api-v1', turnNotificationPolicy:'all-members-v1', notificationReadPolicy:'durable-v1' });
  const groupTurn = path.match(/^\/api\/rooms\/([0-9a-f-]{36})\/turn$/i);
  if (groupTurn && request.method === 'GET') {
    const result = await readGroupTurn(deps, readCookie(request.headers.get('cookie'), 'chatx_session'), groupTurn[1]!);
    if (!result.ok) return failure(deps, result.error);
    return json(result);
  }

  const transfer = path.match(/^\/api\/rooms\/([0-9a-f-]{36})\/uploads\/([0-9a-f-]{36})(\/complete)?$/i);
  if (transfer && (request.method === 'POST' || request.method === 'PATCH')) {
    const origin = request.headers.get('origin');
    if (request.headers.get('x-chatx-request') !== '1' || (origin !== null && !trustedOrigin(origin, deps))) return failure(deps, 'forbidden');
    const result = await handleTransfer(deps, request, transfer[1]!, transfer[2]!, Boolean(transfer[3]));
    const { status, ...payload } = result; return json(payload, status);
  }
  const sync = path.match(/^\/api\/rooms\/([0-9a-f-]{36})\/sync$/i);
  if (sync && request.method === 'GET') {
    const token = readCookie(request.headers.get('cookie'), 'chatx_session');
    const user = token ? await deps.repo.findSessionUser(hashSession(token), new Date(deps.now())) : null;
    if (!user || user.role !== 'member') return failure(deps, 'invalid_credentials');
    const cursor = new URL(request.url).searchParams.get('cursor');
    if (cursor && cursor.length > 80) return json({error:'invalid_cursor'}, 400);
    const roomId = sync[1]!;
    const watch = new URL(request.url).searchParams.get('wait') === '1' ? armRoomWatch(roomId) : null;
    let result = await deps.repo.readRoomSync(roomId, user.id, cursor);
    if (!result) { watch?.cancel(); return failure(deps, 'not_found'); }
    const idle = !result.reset && !result.hasMore && result.messages.length === 0 && result.readers.length === 0 && result.removedIds.length === 0;
    if (watch && idle) {
      await watch.wait(LIVE_HOLD_MS, request.signal);
      if (!request.signal.aborted) result = await deps.repo.readRoomSync(roomId, user.id, cursor) ?? result;
    } else watch?.cancel();
    if (!result) return failure(deps, 'not_found');
    return json({ ...result, messages: result.messages.map((message) => messageView(message, result.reactions)), reactions: undefined,
      readers: result.readers.map((reader) => ({ ...reader, readAt: reader.readAt.toISOString() })),
      typing: roomTyping(roomId, deps.now(), user.id) });
  }
  const body = await readBody(request, requestBodyLimit(path));
  if (!body) return failure(deps, 'invalid_credentials');
  const typingPath = path.match(/^\/api\/rooms\/([0-9a-f-]{36})\/typing$/i);
  if (typingPath && request.method === 'POST') {
    const token = readCookie(request.headers.get('cookie'), 'chatx_session');
    const user = token ? await deps.repo.findSessionUser(hashSession(token), new Date(deps.now())) : null;
    if (!user || user.role !== 'member') return failure(deps, 'invalid_credentials');
    const roomId = typingPath[1]!;
    if (!await deps.repo.isRoomMember(roomId, user.id)) return failure(deps, 'not_found');
    publishTyping(roomId, user.id, body.on === true, deps.now());
    return json({ ok: true });
  }
  const mutating = request.method === 'POST' || request.method === 'PATCH' || request.method === 'DELETE';
  const origin = request.headers.get('origin');
  if (mutating && (request.headers.get('x-chatx-request') !== '1' || (origin !== null && !trustedOrigin(origin, deps)))) {
    return failure(deps, 'forbidden');
  }
  const ip = clientIp(request);

  if (request.method === 'POST' && path === '/api/auth/google') {
    const result = await previewGoogle(deps, { credential: body.credential, ip });
    if (!result.ok) return failure(deps, result.error);
    if (result.step === 'ready') {
      const response = json({ step: result.step, user: result.user });
      const previous = readCookie(request.headers.get('cookie'), 'chatx_session');
      if(previous)await deps.repo.deleteSession(hashSession(previous));
      response.headers.append('set-cookie', sessionCookie(result.sessionToken, secureRequest(request)));
      return response;
    }
    return json({ step: result.step, name: result.name, picture: result.picture });
  }
  if (request.method === 'POST' && path === '/api/auth/google/profile') {
    const result = await acceptGoogle(deps, { credential: body.credential, displayName: body.displayName, ip });
    if (!result.ok) return failure(deps, result.error);
    const response = json({ step: result.step, user: result.user });
    const previous = readCookie(request.headers.get('cookie'), 'chatx_session');
    if(previous)await deps.repo.deleteSession(hashSession(previous));
    response.headers.append('set-cookie', sessionCookie(result.sessionToken, secureRequest(request)));
    return response;
  }
  if (request.method === 'GET' && path === '/api/links/preview') {
    const user = await deps.repo.findSessionUser(hashSession(readCookie(request.headers.get('cookie'), 'chatx_session')), new Date(deps.now()));
    if (!user) return failure(deps, 'invalid_credentials');
    const target = new URL(request.url).searchParams.get('url') ?? '';
    if (target.length > 2000) return json({ error: 'invalid_url' }, 400);
    const card = await cachedLinkCard(target).catch(() => null);
    if (!card) return json({ error: 'invalid_url' }, 400);
    return json(card);
  }
  if (request.method === 'GET' && path === '/api/presence') {
    const result = await readPresence(deps, readCookie(request.headers.get('cookie'), 'chatx_session'));
    if (!result.ok) return failure(deps, result.error);
    return json({ users: result.users });
  }
  if (request.method === 'POST' && path === '/api/presence') {
    const result = await reportPresence(deps, {
      token: readCookie(request.headers.get('cookie'), 'chatx_session'),
      status: body.status,
    });
    if (!result.ok) return failure(deps, result.error);
    return json({ ok: true });
  }
  const roomMessages = path.match(/^\/api\/rooms\/([0-9a-f-]{36})\/messages$/i);
  if (path === '/api/keys' && request.method === 'GET') {
    const result = await readKeys(deps, readCookie(request.headers.get('cookie'), 'chatx_session'));
    return result.ok ? json(result.keys) : failure(deps, result.error);
  }
  if (path === '/api/keys' && request.method === 'POST') {
    const result = await saveKeys(deps, { token: readCookie(request.headers.get('cookie'), 'chatx_session'), publicKey: body.publicKey, backup: body.backup, reset: body.reset });
    return result.ok ? json({ ok: true }) : failure(deps, result.error);
  }
  const roomKeys = path.match(/^\/api\/rooms\/([0-9a-f-]{36})\/keys$/i);
  if (roomKeys && request.method === 'GET') {
    const result = await readRoomKeys(deps, { token: readCookie(request.headers.get('cookie'), 'chatx_session'), roomId: roomKeys[1] });
    return result.ok ? json({ members: result.members, keys: result.keys, mine: result.mine }) : failure(deps, result.error);
  }
  if (roomKeys && request.method === 'POST') {
    const result = await addRoomKeys(deps, { token: readCookie(request.headers.get('cookie'), 'chatx_session'), roomId: roomKeys[1], wraps: body.wraps });
    return result.ok ? json({ ok: true }) : failure(deps, result.error);
  }
  const roomRead = path.match(/^\/api\/rooms\/([0-9a-f-]{36})\/read$/i);
  if (roomRead && request.method === 'POST') {
    const result = await markRoomSeen(deps, { token: readCookie(request.headers.get('cookie'), 'chatx_session'), roomId: roomRead[1], messageId: body.messageId });
    return result.ok ? json(result) : failure(deps, result.error);
  }
  const messageChange = path.match(/^\/api\/rooms\/([0-9a-f-]{36})\/messages\/([0-9a-f-]{36})$/i);
  if (messageChange && (request.method === 'PATCH' || request.method === 'DELETE')) {
    const result = await changeMessage(deps, { token: readCookie(request.headers.get('cookie'), 'chatx_session'), roomId: messageChange[1], messageId: messageChange[2], text: body.text, deleting: request.method === 'DELETE' });
    return result.ok ? json({ ok: true }) : failure(deps, result.error);
  }
  const roomChange = path.match(/^\/api\/rooms\/([0-9a-f-]{36})$/i);
  if (roomChange && request.method === 'PATCH') {
    const result = await updateRoomProfile(deps, { token: readCookie(request.headers.get('cookie'), 'chatx_session'), roomId: roomChange[1], patch: body });
    return result.ok ? json({ conversation: result.conversation }) : failure(deps, result.error);
  }
  if (roomMessages && request.method === 'GET') {
    const result = await readRoomMessages(deps, {
      token: readCookie(request.headers.get('cookie'), 'chatx_session'),
      roomId: roomMessages[1] ?? '',
      beforeId: new URL(request.url).searchParams.get('beforeId'),
      aroundId: new URL(request.url).searchParams.get('aroundId'),
    });
    if (!result.ok) return failure(deps, result.error);
    return json({ messages: result.messages, readers: result.readers, hasMore: result.hasMore });
  }
  const roomFile = path.match(/^\/api\/rooms\/([0-9a-f-]{36})\/messages\/([0-9a-f-]{36})\/file$/i);
  if (roomFile && request.method === 'GET') {
    const result = await readRoomFile(deps, {
      token: readCookie(request.headers.get('cookie'), 'chatx_session'),
      roomId: roomFile[1] ?? '',
      messageId: roomFile[2] ?? '',
    });
    if (!result.ok) return failure(deps, result.error);
    return download(result.file.name, result.file.bytes);
  }
  const roomImage = path.match(/^\/api\/rooms\/([0-9a-f-]{36})\/messages\/([0-9a-f-]{36})\/image$/i);
  if (roomImage && request.method === 'GET') {
    const result = await readRoomImage(deps, {
      token: readCookie(request.headers.get('cookie'), 'chatx_session'),
      roomId: roomImage[1] ?? '',
      messageId: roomImage[2] ?? '',
    });
    if (!result.ok) return failure(deps, result.error);
    return jpeg(result.bytes);
  }
  const reaction = path.match(/^\/api\/rooms\/([0-9a-f-]{36})\/messages\/([0-9a-f-]{36})\/reaction$/i);
  if (reaction && request.method === 'POST') {
    const result = await setRoomReaction(deps, {
      token: readCookie(request.headers.get('cookie'), 'chatx_session'),
      roomId: reaction[1] ?? '',
      messageId: reaction[2] ?? '',
      emoji: body.emoji,
    });
    if (!result.ok) return failure(deps, result.error);
    return json({ ok: true });
  }
  if (roomMessages && request.method === 'POST') {
    const result = await postRoomMessage(deps, {
      token: readCookie(request.headers.get('cookie'), 'chatx_session'),
      roomId: roomMessages[1] ?? '',
      id: body.id,
      text: body.text,
      replyToId: body.replyToId,
      image: body.image,
      file: body.file,
      hints: body.hints,
    });
    if (!result.ok) return failure(deps, result.error);
    return json({ message: result.message });
  }
  if (request.method === 'GET' && path === '/api/notifications') {
    const url = new URL(request.url);
    const result = await readInbox(deps, {
      token: readCookie(request.headers.get('cookie'), 'chatx_session'),
      before: url.searchParams.get('before'),
      beforeId: url.searchParams.get('beforeId'),
    });
    if (!result.ok) return failure(deps, result.error);
    return json({ notifications: result.notifications, unreadCount: result.unreadCount });
  }
  if (request.method === 'POST' && path === '/api/notifications/read') {
    const result = await markInboxRead(deps, {
      token: readCookie(request.headers.get('cookie'), 'chatx_session'),
      ids: body.ids,
      all: body.all,
      until: body.until,
    });
    if (!result.ok) return failure(deps, result.error);
    return json({ ok: true, unreadCount: result.unreadCount });
  }
  if (request.method === 'POST' && path === '/api/notifications/clear') {
    const result = await clearInbox(deps, readCookie(request.headers.get('cookie'), 'chatx_session'), body.until);
    if (!result.ok) return failure(deps, result.error);
    return json({ ok: true });
  }
  if (request.method === 'POST' && path === '/api/push/register') {
    const result = await registerPushToken(deps, typeof body.token === 'string' ? body.token : undefined, typeof body.platform === 'string' ? body.platform : undefined, readCookie(request.headers.get('cookie'), 'chatx_session'));
    if (!result.ok) return failure(deps, result.error);
    return json({ ok: true });
  }
  if (request.method === 'POST' && path === '/api/push/unregister') {
    const result = await unregisterPushToken(deps, typeof body.token === 'string' ? body.token : undefined, readCookie(request.headers.get('cookie'), 'chatx_session'));
    if (!result.ok) return failure(deps, result.error);
    return json({ ok: true });
  }
  if (request.method === 'POST' && path === '/api/push/prefs') {
    const result = await savePushPrefs(deps, typeof body.quiet === 'string' ? body.quiet : undefined, typeof body.hiddenKinds === 'string' ? body.hiddenKinds : undefined, readCookie(request.headers.get('cookie'), 'chatx_session'));
    if (!result.ok) return failure(deps, result.error);
    return json({ ok: true });
  }
  const orphanRoom = path.match(/^\/api\/rooms\/([0-9a-f-]{36})$/i);
  if (orphanRoom && request.method === 'DELETE') {
    const result = await dropOrphanPrivate(deps, { token: readCookie(request.headers.get('cookie'), 'chatx_session'), roomId: orphanRoom[1]! });
    return result.ok ? json({ ok: true }) : failure(deps, result.error);
  }
  if (request.method === 'POST' && path === '/api/rooms') {
    const result = await openRoom(deps, {
      token: readCookie(request.headers.get('cookie'), 'chatx_session'),
      kind: body.kind,
      userId: body.userId,
      name: body.name,
      memberIds: body.memberIds,
    });
    if (!result.ok) return failure(deps, result.error);
    return json({ conversation: result.conversation, users: result.users });
  }
  if (request.method === 'GET' && path === '/api/saved') {
    const result = await readSaved(deps, readCookie(request.headers.get('cookie'), 'chatx_session'), new URL(request.url).searchParams.get('beforeId') ?? undefined);
    if (!result.ok) return failure(deps, result.error);
    return json({ saved: result.saved, hasMore: result.hasMore });
  }
  if (request.method === 'POST' && path === '/api/saved') {
    const result = await keepMessage(deps, {
      token: readCookie(request.headers.get('cookie'), 'chatx_session'),
      messageId: body.messageId,
      saved: body.saved,
    });
    if (!result.ok) return failure(deps, result.error);
    return json({ ok: true });
  }
  if (request.method === 'GET' && path === '/api/home') {
    const result = await readHome(deps, readCookie(request.headers.get('cookie'), 'chatx_session'));
    if (!result.ok) return failure(deps, result.error);
    return json({ conversations: result.conversations, users: result.users });
  }
  if (request.method === 'GET' && path === '/api/profile') {
    const result = await readOwnProfile(deps, readCookie(request.headers.get('cookie'), 'chatx_session'));
    if (!result.ok) return failure(deps, result.error);
    return json({ user: result.user });
  }
  if (request.method === 'PATCH' && path === '/api/profile') {
    const result = await updateOwnProfile(deps, {
      token: readCookie(request.headers.get('cookie'), 'chatx_session'),
      displayName: body.displayName,
      bio: body.bio,
      banner: body.banner,
      avatar: body.avatar,
      color: body.color,
      messageFont: body.messageFont,
      hasDisplayName: Object.prototype.hasOwnProperty.call(body, 'displayName'),
      hasBio: Object.prototype.hasOwnProperty.call(body, 'bio'),
      hasBanner: Object.prototype.hasOwnProperty.call(body, 'banner'),
      hasAvatar: Object.prototype.hasOwnProperty.call(body, 'avatar'),
      hasColor: Object.prototype.hasOwnProperty.call(body, 'color'),
      hasMessageFont: Object.prototype.hasOwnProperty.call(body, 'messageFont'),
      ip,
    });
    if (!result.ok) return failure(deps, result.error);
    return json({ user: result.user });
  }
  if (request.method === 'GET' && path === '/api/owner/members') {
    const result = await listOwnerMembers(deps, readCookie(request.headers.get('cookie'), 'chatx_session'));
    if (!result.ok) return failure(deps, result.error);
    return json({ users: result.users, groups: result.groups });
  }
  if (request.method === 'POST' && path === '/api/owner/groups/erase') {
    const result = await eraseOwnerGroup(deps, {
      token: readCookie(request.headers.get('cookie'), 'chatx_session'),
      roomId: body.roomId,
      choices: body,
    });
    if (!result.ok) return failure(deps, result.error);
    return json({ ok: true });
  }
  if (request.method === 'POST' && path === '/api/owner/erase') {
    const result = await eraseOwnerMember(deps, {
      token: readCookie(request.headers.get('cookie'), 'chatx_session'),
      userId: body.userId,
      choices: body,
    });
    if (!result.ok) return failure(deps, result.error);
    return json({ ok: true });
  }
  if (request.method === 'POST' && path === '/api/auth/logout') {
    await endSession(deps, readCookie(request.headers.get('cookie'), 'chatx_session'));
    const response = json({ ok: true });
    response.headers.append('set-cookie', clearSessionCookie(secureRequest(request)));
    return response;
  }

  return json({ error: 'not_found' }, 404);
}

export function createApi(deps: Deps) {
  const budget = createRequestBudget(deps.now);
  return async (request: Request) => {
    const mutating = ['POST','PATCH','DELETE'].includes(request.method);
    const origin = request.headers.get('origin');
    if(mutating && (request.headers.get('x-chatx-request') !== '1' || origin !== null && !trustedOrigin(origin,deps))) return withCors(request,failure(deps,'forbidden'),allowedOrigin(origin,deps));
    const retryAfter = budget(request,clientIp(request));
    if(retryAfter)return withCors(request,json({error:'rate_limited'},429,{retryAfter}),allowedOrigin(origin,deps));
    // Always authorize and build the current representation before validating it.
    let response = await route(deps, request);
    if (request.method === 'GET' && response.status === 200 && response.headers.get('content-type')?.startsWith('application/json')) {
      const body = await response.text();
      const etag = `"${createHash('sha256').update(body).digest('base64url')}"`;
      const headers = new Headers(response.headers);
      headers.set('etag', etag);
      response = request.headers.get('if-none-match') === etag
        ? new Response(null, { status: 304, headers })
        : new Response(body, { status: 200, headers });
    }
    response = await compressJson(response, request.headers.get('accept-encoding'));
    return withCors(request, response, allowedOrigin(request.headers.get('origin'), deps));
  };
}
