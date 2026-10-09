import { expect, it } from 'vitest';
import { preserveCurrentTurn, readGroupTurnPayload } from './groupTurn';
import type { Conversation } from '../types/conversation';
const roomId = '00000000-0000-4000-8000-000000000001';
const holderId = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const payload = { roomId, turnUserId: holderId, participantIds: [holderId, other],
  turnOpensAt: '2026-10-08T12:00:00Z', turnExpiresAt: '2026-10-15T12:00:00Z', serverTime: '2026-10-09T12:00:00Z',
  holder: { id: holderId, username: 'alice', displayName: 'Alice', role: 'member', bio: '', color: '#4d7ea8' } };
it('reads an authoritative turn and rejects expired or unrelated responses', () => {
  expect(readGroupTurnPayload(payload, roomId)?.turnUserId).toBe(holderId);
  expect(readGroupTurnPayload(payload, other)).toBeNull();
  expect(readGroupTurnPayload({ ...payload, serverTime: '2026-10-15T12:00:00Z' }, roomId)).toBeNull();
  expect(readGroupTurnPayload({ ...payload, holder: { ...payload.holder, id: other } }, roomId)).toBeNull();
});
it('prevents a delayed home response from restoring an expired turn', () => {
  const current: Conversation = { id: roomId, type: 'global', participantIds: [holderId, other], unreadCount: 0, createdAt: payload.turnOpensAt,
    turnUserId: holderId, turnOpensAt: payload.turnOpensAt };
  const incoming = { ...current, turnUserId: other, turnOpensAt: '2026-09-20T12:00:00Z' };
  expect(preserveCurrentTurn(incoming, current).turnUserId).toBe(holderId);
  expect(preserveCurrentTurn(incoming, current).turnOpensAt).toBe(payload.turnOpensAt);
});
