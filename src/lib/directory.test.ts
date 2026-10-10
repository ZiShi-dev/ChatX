import { describe, expect, it } from 'vitest';
import { readDirectoryUsers, readInviteRecord, readInvites, readRedeemedUser } from './directory';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'نورة',
  username: 'nora',
  role: 'member',
};

const invite = {
  id: '22222222-2222-4222-8222-222222222222',
  code: 'CHATX-7K2M-9QPL-X4HN-W8RD',
  isActive: true,
  usedBy: null,
  expiresAt: '2026-10-15T12:00:00.000Z',
};

describe('directory payloads', () => {
  it('accepts an account list and drops secrets', () => {
    const users = readDirectoryUsers({ users: [{ ...user, passwordHash: 'secret', email: 'owner@example.com' }] });
    expect(users?.[0]).toMatchObject({ username: 'nora', role: 'member', status: 'offline' });
    expect(users?.[0]).not.toHaveProperty('passwordHash');
    expect(readDirectoryUsers({ users: [{ ...user, role: 'owner' }] })).toBeNull();
    expect(readDirectoryUsers({ users: [{ ...user, displayName: 'الرجل', username: 'الرجل' }] })?.[0]?.username).toBe('الرجل');
    expect(readDirectoryUsers({ users: [{ ...user, displayName: 'المبجل العالمي', username: 'المبجل العالمي' }] })?.[0]?.username).toBe('المبجل العالمي');
    expect(readDirectoryUsers({ users: [{ ...user, bio: 'نبذة', bannerUrl: 'data:image/jpeg;base64,/9j/AAAA', avatarUrl: 'data:image/jpeg;base64,/9j/AAAA' }] })?.[0]).toMatchObject({
      bio: 'نبذة',
      bannerUrl: 'data:image/jpeg;base64,/9j/AAAA',
      avatarUrl: 'data:image/jpeg;base64,/9j/AAAA',
    });
    expect(readDirectoryUsers({ users: [{ ...user, avatarUrl: 'data:image/svg+xml;base64,PHN2Zy8+' }] })).toBeNull();
    expect(readDirectoryUsers({ users: [{ ...user, bio: 'ا'.repeat(161) }] })).toBeNull();
    expect(readDirectoryUsers({ users: [{ ...user, bannerUrl: 'data:image/svg+xml;base64,PHN2Zy8+' }] })).toBeNull();
    expect(readDirectoryUsers({ users: [{ ...user, color: '#4d7ea8', messageFont: 'classic' }] })?.[0]).toMatchObject({
      color: '#4d7ea8',
      messageFont: 'classic',
    });
    expect(readDirectoryUsers({ users: [{ ...user, color: '#ffffff', messageFont: 'comic' }] })?.[0]).toMatchObject({
      color: '#ffffff',
      messageFont: 'system',
    });
    expect(readDirectoryUsers({ users: [{ ...user, messageFont: 'classic' }] })?.[0]?.messageFont).toBe('classic');
  });

  it('accepts a long invite and rejects a short one', () => {
    expect(readInvites({ invites: [invite] })?.[0]?.code).toBe(invite.code);
    expect(readInviteRecord({ invite })).toMatchObject({ usedBy: null });
    expect(readInvites({ invites: [{ ...invite, code: 'CHATX-AB12' }] })).toBeNull();
  });

  it('reads the account created by a code', () => {
    expect(readRedeemedUser({ access: 'new', user })?.displayName).toBe('نورة');
    expect(readRedeemedUser({ access: 'inactive', user })).toBeNull();
  });
});
