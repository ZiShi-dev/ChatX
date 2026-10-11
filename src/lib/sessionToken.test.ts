import { beforeEach, expect, it } from 'vitest';
import { clearStoredSession, currentSession, rememberSession } from './sessionToken';

beforeEach(() => {
  localStorage.clear();
  clearStoredSession();
});

it('keeps only a real login token', () => {
  rememberSession({ sessionToken: 'short' });
  expect(currentSession()).toBe('');
  const token = 'A'.repeat(43);
  rememberSession({ sessionToken: token });
  expect(currentSession()).toBe(token);
  clearStoredSession();
  expect(currentSession()).toBe('');
});
