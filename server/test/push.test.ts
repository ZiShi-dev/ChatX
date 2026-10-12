import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pushSuppressed } from '../src/push.ts';
import { sendMessagePush } from '../src/push.ts';
import { generateKeyPairSync } from 'node:crypto';
import type { Deps } from '../src/authService.ts';

describe('pushSuppressed', () => {
  it('respects mute levels and hidden kinds', () => {
    const room = '11111111-1111-4111-8111-111111111111';
    assert.equal(pushSuppressed('', '', room, 'message'), false);
    assert.equal(pushSuppressed(`${room}=none`, '', room, 'message'), true);
    assert.equal(pushSuppressed(`${room}=mentions`, '', room, 'message'), true);
    assert.equal(pushSuppressed(`${room}=mentions`, '', room, 'mention'), false);
    assert.equal(pushSuppressed('', 'reaction', room, 'reaction'), true);
    assert.equal(pushSuppressed(`${room}=off:message.reaction`, '', room, 'message'), true);
    assert.equal(pushSuppressed(`${room}=off:message.reaction`, '', room, 'mention'), false);
  });
});

it('sends real FCM notification payloads, shares OAuth and removes unregistered devices', async (t) => {
  const saved = { ...process.env };
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; for (const name of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; } });
  process.env.FIREBASE_PROJECT_ID = 'synthetic-project';
  process.env.FIREBASE_CLIENT_EMAIL = 'synthetic@example.invalid';
  process.env.FIREBASE_PRIVATE_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  let oauth = 0;
  const payloads: Array<{ message: { token: string; android: { priority: string; ttl: string; notification: { tag: string; channel_id: string } }; data: Record<string, string> } }> = [];
  const removed: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      oauth++;
      return Response.json({ access_token: 'synthetic-access', expires_in: 3600 });
    }
    assert.equal(String(url), 'https://fcm.googleapis.com/v1/projects/synthetic-project/messages:send');
    assert.ok(init?.signal);
    const payload = JSON.parse(String(init?.body));
    payloads.push(payload);
    return payload.message.token === 'expired-device'
      ? Response.json({ error: { details: [{ errorCode: 'UNREGISTERED' }] } }, { status: 404 })
      : Response.json({ name: 'synthetic-delivery' });
  };
  let dataOnly = false;
  const deps = { repo: {
    listRoomNoticeMembers: async () => [{ id: 'recipient', username: 'Bob' }],
    readRoomLabel: async () => ({ kind: 'private', name: null }),
    findUserById: async () => ({ displayName: 'Alice' }),
    readPushPrefs: async () => ({ quiet: '', hiddenKinds: '' }),
    listPushTokens: async () => ['valid-device', 'expired-device'],
    listPushDevices: async () => [{ token: 'valid-device', platform: dataOnly ? 'android-data-v1' : 'android' }],
    deletePushToken: async (_id: string, token: string) => { removed.push(token); },
  } } as unknown as Deps;
  await sendMessagePush(deps, { id: 'message-id', roomId: 'private-room', senderId: 'sender', text: 'Hello', createdAt: new Date(), deleted: false });
  for (let tries = 0; tries < 20 && removed.length === 0; tries++) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(oauth, 1);
  assert.equal(payloads.length, 2);
  assert.equal(payloads[0]!.message.android.priority, 'HIGH');
  assert.equal(payloads[0]!.message.android.ttl, '86400s');
  assert.equal(payloads[0]!.message.android.notification.tag, 'message-id');
  assert.equal(payloads[0]!.message.android.notification.channel_id, 'chatx-messages');
  assert.deepEqual(removed, ['expired-device']);
  dataOnly = true;
  await sendMessagePush(deps, { id: 'second-message', roomId: 'private-room', senderId: 'sender', text: 'Second', createdAt: new Date(), deleted: false });
  for (let tries = 0; tries < 20 && payloads.length < 4; tries++) await new Promise(resolve => setTimeout(resolve, 1));
  const compatible = payloads.find(payload => payload.message.token === 'valid-device' && payload.message.data.messageId === 'second-message')!;
  assert.ok(compatible);
  assert.equal('notification' in compatible.message.android, false);
  assert.equal('collapse_key' in compatible.message.android, false);
  assert.equal(compatible.message.android.priority, 'HIGH');
  assert.equal(compatible.message.data.body, 'Second');
});
