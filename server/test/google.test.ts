import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readGoogleIdentity } from '../src/google.ts';

const now = Date.parse('2026-10-08T18:00:00.000Z');

describe('Google account claims', () => {
  it('accepts a verified Google account and ignores an unsafe photo', () => {
    const identity = readGoogleIdentity({
      iss: 'https://accounts.google.com',
      aud: 'chatx-client',
      exp: Math.floor(now / 1000) + 60,
      email: 'Nora@Gmail.com',
      email_verified: true,
      sub: '123',
      name: 'نورة',
      picture: 'http://example.test/photo.jpg',
    }, 'chatx-client', now);
    assert.deepEqual(identity, { sub: '123', email: 'nora@gmail.com', name: 'نورة', picture: '' });
  });

  it('rejects an unverified, expired, or foreign token', () => {
    const base = {
      iss: 'https://accounts.google.com',
      aud: 'chatx-client',
      exp: Math.floor(now / 1000) + 60,
      email: 'nora@gmail.com',
      email_verified: true,
      sub: '123',
      name: 'نورة',
    };
    assert.equal(readGoogleIdentity({ ...base, email_verified: false }, 'chatx-client', now), null);
    assert.equal(readGoogleIdentity({ ...base, exp: Math.floor(now / 1000) - 1 }, 'chatx-client', now), null);
    assert.equal(readGoogleIdentity({ ...base, aud: 'other-app' }, 'chatx-client', now), null);
    assert.equal(readGoogleIdentity({ ...base, iss: 'https://evil.example' }, 'chatx-client', now), null);
  });
});
