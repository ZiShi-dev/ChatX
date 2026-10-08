import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLimiter, type Deps } from '../src/authService.ts';
import { loadConfig } from '../src/config.ts';
import { createApi } from '../src/http.ts';
import { createMemoryRepository } from '../src/memory.ts';
import { hashSession } from '../src/session.ts';
import type { AuthUser } from '../src/types.ts';

const now = Date.parse('2026-10-08T12:00:00.000Z');
const bytes = Buffer.from('hello');
const file = { name: 'notes/a.txt', data: bytes.toString('base64') };

function testDeps(): Deps {
  return {
    repo: createMemoryRepository(),
    config: loadConfig({ DATABASE_URL: 'postgres://unused', GOOGLE_CLIENT_ID: '' }),
    now: () => now,
    rateLimit: createLimiter(loadConfig({ DATABASE_URL: 'postgres://unused' }), () => now),
  };
}

function member(id: string, name: string): AuthUser {
  return {
    id,
    email: `${id}@example.invalid`,
    displayName: name,
    username: name,
    role: 'member',
    bio: '',
    bannerUrl: null,
    avatarUrl: null,
  };
}

describe('chat files', () => {
  it('stores a file for the other member and keeps the bytes out of the thread', async () => {
    const deps = testDeps();
    const nora = member('11111111-1111-4111-8111-111111111111', 'نورة');
    const layla = member('22222222-2222-4222-8222-222222222222', 'ليلى');
    const sami = member('33333333-3333-4333-8333-333333333333', 'سامي');
    await deps.repo.insertUser(nora);
    await deps.repo.insertUser(layla);
    await deps.repo.insertUser(sami);
    const noraToken = 'nora-token';
    const laylaToken = 'layla-token';
    const samiToken = 'sami-token';
    await deps.repo.createSession(hashSession(noraToken), nora.id, new Date(now + 60_000));
    await deps.repo.createSession(hashSession(laylaToken), layla.id, new Date(now + 60_000));
    await deps.repo.createSession(hashSession(samiToken), sami.id, new Date(now + 60_000));
    const handle = createApi(deps);
    const headers = (token: string) => ({
      'content-type': 'application/json',
      'x-chatx-request': '1',
      cookie: `chatx_session=${token}`,
    });

    const opened = await handle(new Request('http://127.0.0.1/api/rooms', {
      method: 'POST',
      headers: headers(noraToken),
      body: JSON.stringify({ kind: 'private', userId: layla.id }),
    }));
    assert.equal(opened.status, 200);
    const roomId = ((await opened.json()) as { conversation: { id: string } }).conversation.id;
    const messageId = '55555555-5555-4555-8555-555555555555';

    const rejected = await handle(new Request(`http://127.0.0.1/api/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: headers(noraToken),
      body: JSON.stringify({ id: messageId, file: { name: '../secret.txt', data: file.data } }),
    }));
    assert.equal(rejected.status, 401);

    const sent = await handle(new Request(`http://127.0.0.1/api/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: headers(noraToken),
      body: JSON.stringify({ id: messageId, file }),
    }));
    assert.equal(sent.status, 200);

    const thread = await handle(new Request(`http://127.0.0.1/api/rooms/${roomId}/messages`, {
      headers: { cookie: `chatx_session=${laylaToken}` },
    }));
    const raw = await thread.text();
    assert.equal(raw.includes(file.data), false);
    const body = JSON.parse(raw) as { messages: Array<{ type?: string; fileName?: string; fileSize?: number; text: string }> };
    assert.equal(body.messages[0]?.type, 'file');
    assert.equal(body.messages[0]?.fileName, 'notes/a.txt');
    assert.equal(body.messages[0]?.fileSize, bytes.length);
    assert.equal(body.messages[0]?.text, '');

    const saved = await handle(new Request(`http://127.0.0.1/api/rooms/${roomId}/messages/${messageId}/file`, {
      headers: { cookie: `chatx_session=${laylaToken}` },
    }));
    assert.equal(saved.status, 200);
    assert.equal(saved.headers.get('content-type'), 'application/octet-stream');
    assert.match(saved.headers.get('content-disposition') ?? '', /attachment/);
    assert.deepEqual(Buffer.from(await saved.arrayBuffer()), bytes);

    const outsider = await handle(new Request(`http://127.0.0.1/api/rooms/${roomId}/messages/${messageId}/file`, {
      headers: { cookie: `chatx_session=${samiToken}` },
    }));
    assert.equal(outsider.status, 404);

    const home = await handle(new Request('http://127.0.0.1/api/home', {
      headers: { cookie: `chatx_session=${laylaToken}` },
    }));
    const listed = await home.json() as { conversations: Array<{ id: string; lastMessage?: { type?: string; fileName?: string; text: string } }> };
    const room = listed.conversations.find((item) => item.id === roomId);
    assert.equal(room?.lastMessage?.type, 'file');
    assert.equal(room?.lastMessage?.fileName, 'notes/a.txt');
    assert.equal(JSON.stringify(listed).includes(file.data), false);

    const inbox = await handle(new Request('http://127.0.0.1/api/notifications', {
      headers: { cookie: `chatx_session=${laylaToken}` },
    }));
    const notices = await inbox.json() as { notifications: Array<{ preview: string; kind: string }> };
    const stored = notices.notifications.find((item) => item.preview === 'notes/a.txt');
    assert.equal(stored?.kind, 'message');
  });
});
