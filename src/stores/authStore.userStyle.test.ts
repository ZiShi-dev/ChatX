import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as adminApi from '../lib/adminApi';
import { useAuthStore } from './authStore';
import { useUserStore } from './userStore';

const MEMBER_ID = '11111111-1111-4111-8111-111111111111';

const baseUser = {
  id: MEMBER_ID,
  displayName: 'نورة',
  username: 'نورة',
  role: 'member' as const,
  status: 'online' as const,
  bio: '',
  color: '#3d9b84',
  messageFont: 'system' as const,
};

beforeEach(() => {
  useAuthStore.setState({ currentUser: baseUser, activated: true, accounts: [baseUser] });
  useUserStore.setState({ users: [baseUser] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('authStore user style', () => {
  it('applies color and font locally before the server answers', async () => {
    const fetch = vi.spyOn(adminApi, 'adminFetch').mockImplementation(() => new Promise(() => {}));
    void useAuthStore.getState().saveAccountProfile({ color: '#c4893a', messageFont: 'classic' });
    expect(useAuthStore.getState().currentUser.color).toBe('#c4893a');
    expect(useAuthStore.getState().currentUser.messageFont).toBe('classic');
    expect(useUserStore.getState().users.find((user) => user.id === MEMBER_ID)?.messageFont).toBe('classic');
    expect(fetch).toHaveBeenCalledWith('/api/profile', {
      method: 'PATCH',
      body: { color: '#c4893a', messageFont: 'classic' },
    });
  });

  it('merges server profile fields after save', async () => {
    vi.spyOn(adminApi, 'adminFetch').mockResolvedValue({
      user: {
        id: MEMBER_ID,
        displayName: 'نورة',
        username: 'نورة',
        role: 'member',
        color: '#a56b7a',
        messageFont: 'clear',
      },
    });
    const result = await useAuthStore.getState().saveAccountProfile({ color: '#a56b7a', messageFont: 'clear' });
    expect(result).toBe('ok');
    expect(useAuthStore.getState().currentUser).toMatchObject({ color: '#a56b7a', messageFont: 'clear' });
  });

  it('accepts any hex color in the optimistic patch', async () => {
    vi.spyOn(adminApi, 'adminFetch').mockResolvedValue({
      user: { ...baseUser, color: '#ffffff' },
    });
    await useAuthStore.getState().saveAccountProfile({ color: '#ffffff' });
    expect(useAuthStore.getState().currentUser.color).toBe('#ffffff');
  });
});
