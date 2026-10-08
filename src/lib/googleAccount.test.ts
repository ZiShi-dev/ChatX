import { describe, expect, it } from 'vitest';
import { readGooglePreview, readGoogleReadyUser } from './googleAccount';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'نورة',
  username: 'نورة',
  role: 'member',
};

describe('google account payloads', () => {
  it('reads a verified preview and a ready account', () => {
    expect(readGooglePreview({ step: 'profile', name: 'نورة', picture: 'https://lh3.googleusercontent.com/a/photo' })).toEqual({
      name: 'نورة',
      picture: 'https://lh3.googleusercontent.com/a/photo',
    });
    expect(readGooglePreview({ step: 'profile', name: 'نورة', picture: 'http://example.test/a.jpg' })?.picture).toBe('');
    expect(readGoogleReadyUser({ step: 'ready', user })?.displayName).toBe('نورة');
    expect(readGoogleReadyUser({ step: 'profile', user })).toBeNull();
  });
});
