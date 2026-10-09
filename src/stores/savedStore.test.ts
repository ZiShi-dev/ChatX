import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adminFetch } from '../lib/adminApi';
import type { SavedEntry } from '../lib/saved';
import { useAuthStore } from './authStore';
import { useSavedStore } from './savedStore';

vi.mock('../lib/adminApi', () => ({ adminFetch: vi.fn(), AdminApiError: class extends Error {} }));
const initial = useAuthStore.getState();
const alice = { ...initial.currentUser, id: '11111111-1111-4111-8111-111111111111' };
const bob = { ...initial.currentUser, id: '22222222-2222-4222-8222-222222222222' };
const entry: SavedEntry = {
  userId: alice.id, messageId: '33333333-3333-4333-8333-333333333333',
  conversationId: '44444444-4444-4444-8444-444444444444', conversationName: 'Private',
  senderId: bob.id, senderName: 'Bob', type: 'text', preview: 'Private bookmark',
  createdAt: '2026-10-09T12:00:00Z', savedAt: '2026-10-09T12:00:00Z',
};
beforeEach(() => {
  localStorage.clear(); vi.mocked(adminFetch).mockReset().mockResolvedValue({});
  useAuthStore.setState({ currentUser: alice, activated: true });
  useSavedStore.setState({ entries: [], hasMore: false, lastError: '' });
});
afterEach(() => { useAuthStore.setState(initial); localStorage.clear(); });

it('keeps the list and bookmark indicator isolated when switching accounts', async () => {
  useSavedStore.getState().toggle(entry);
  await Promise.resolve();
  expect(useSavedStore.getState().entries).toEqual([entry]);
  useAuthStore.setState({ currentUser: bob });
  expect(useSavedStore.getState().entries).toEqual([]);
  useSavedStore.getState().toggle(entry);
  useSavedStore.getState().remove(alice.id, entry.messageId);
  expect(useSavedStore.getState().entries).toEqual([]);
  expect(adminFetch).toHaveBeenCalledTimes(1);
  useAuthStore.setState({ currentUser: alice });
  expect(useSavedStore.getState().entries).toEqual([entry]);
  useAuthStore.setState({ activated: false });
  expect(useSavedStore.getState().entries).toEqual([]);
});

it('does not restore another account bookmark when an old removal fails', async () => {
  useSavedStore.setState({ entries: [entry] });
  let rejectRequest!: (error: Error) => void;
  vi.mocked(adminFetch).mockReturnValueOnce(new Promise((_resolve, reject) => { rejectRequest = reject; }));
  useSavedStore.getState().remove(alice.id, entry.messageId);
  useAuthStore.setState({ currentUser: bob });
  rejectRequest(new Error('network lost'));
  await vi.waitFor(() => expect(useSavedStore.getState().entries).toEqual([]));
  expect(useSavedStore.getState().lastError).toBe('');
});
