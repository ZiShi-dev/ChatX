import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepository } from '../src/memory.ts';
it('transfers a device token to the new account and ignores old-account cleanup', async () => {
  const repo = createMemoryRepository();
  await repo.savePushToken('old-account', 'same-device-token', 'android');
  await repo.savePushToken('new-account', 'same-device-token', 'android');
  assert.deepEqual(await repo.listPushTokens('old-account'), []);
  assert.deepEqual(await repo.listPushTokens('new-account'), ['same-device-token']);
  await repo.deletePushToken('old-account', 'same-device-token');
  assert.deepEqual(await repo.listPushTokens('new-account'), ['same-device-token']);
});
