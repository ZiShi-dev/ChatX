import { describe, expect, it } from 'vitest';
import type { InviteCode } from '../types/invite';
import type { User } from '../types/user';
import { inviteAccess, signInWithCode } from './invite';

const invites = [
  { code: 'CHATX-AB12', isActive: true, usedBy: 'me' },
  { code: 'CHATX-NEW1', isActive: true, usedBy: null },
  { code: 'CHATX-OLD1', isActive: false, usedBy: 'me' },
];

describe('inviteAccess', () => {
  it('lets a known active code back in after logout', () => {
    expect(inviteAccess(invites, 'chatx-ab12')).toBe('return');
  });

  it('asks for a profile only the first time a code is used', () => {
    expect(inviteAccess(invites, 'CHATX-NEW1')).toBe('new');
  });

  it('refuses a deactivated code', () => {
    expect(inviteAccess(invites, 'CHATX-OLD1')).toBe('inactive');
  });

  it('refuses an unknown code', () => {
    expect(inviteAccess(invites, 'CHATX-NOPE')).toBe('unknown');
    expect(inviteAccess(invites, '  ')).toBe('unknown');
  });
});

const owner: User = {
  id: 'me',
  username: 'ff',
  displayName: 'FF',
  role: 'creator',
  status: 'online',
  bio: '',
  color: '#3d9b84',
};

const codes: InviteCode[] = [
  { id: '1', code: 'CHATX-AB12', isActive: true, usedBy: 'me' },
  { id: '2', code: 'CHATX-NEW1', isActive: true, usedBy: null },
  { id: '3', code: 'CHATX-OLD1', isActive: false, usedBy: null },
];

describe('signInWithCode', () => {
  it('opens the account already linked to the code', () => {
    const result = signInWithCode(codes, [owner], 'CHATX-AB12', {
      displayName: 'Autre',
      username: 'autre',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user).toMatchObject({ id: 'me', displayName: 'FF' });
    expect(result.accounts).toHaveLength(1);
  });

  it('creates one account for a fresh code and then only logs in', () => {
    const created = signInWithCode(codes, [owner], 'CHATX-NEW1', {
      displayName: 'Nora',
      username: 'nora',
    }, () => 'user-nora');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.user.id).toBe('user-nora');
    expect(created.accounts.map((account) => account.displayName)).toEqual(['FF', 'Nora']);
    expect(created.invites.find((invite) => invite.code === 'CHATX-NEW1')?.usedBy).toBe('user-nora');

    const again = signInWithCode(created.invites, created.accounts, 'CHATX-NEW1');
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.user.displayName).toBe('Nora');
    expect(again.accounts).toHaveLength(2);
    expect(again.accounts[0]?.displayName).toBe('FF');
  });

  it('refuses a deactivated code', () => {
    expect(signInWithCode(codes, [owner], 'CHATX-OLD1').ok).toBe(false);
  });
});
