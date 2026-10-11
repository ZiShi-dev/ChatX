import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pushSuppressed } from '../src/push.ts';

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
