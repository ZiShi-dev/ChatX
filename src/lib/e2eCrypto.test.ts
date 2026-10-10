import { describe, expect, it } from 'vitest';
import {
  createIdentity, importRoomKey, newRoomKey, openBytes, openText, restoreIdentity, sealBytes, sealedKeyId, sealText, unwrapRoomKey, wrapRoomKey,
} from './e2eCrypto';

const roomId = '00000000-0000-4000-8000-000000000001';
const keyId = '11111111-1111-4111-8111-111111111111';

describe('e2e crypto', () => {
  it('restores an identity only with the right recovery code', async () => {
    const { identity, backup } = await createIdentity('code de secours long');
    expect(identity.publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/);
    expect(backup.salt).toHaveLength(22);
    expect(backup.iv).toHaveLength(16);
    expect(await restoreIdentity(backup, identity.publicKey, 'mauvais code long')).toBeNull();
    expect(await restoreIdentity(backup, identity.publicKey, 'code de secours long')).not.toBeNull();
  }, 30_000);

  it('shares a room key between two members and seals text and bytes', async () => {
    const alice = (await createIdentity('alice recovery 1')).identity;
    const bob = (await createIdentity('bob recovery 12')).identity;
    const raw = newRoomKey();
    const wrapped = await wrapRoomKey(alice.privateKey, bob.publicKey, raw, roomId, keyId, 'bob');
    expect(wrapped.length).toBeLessThanOrEqual(200);
    const received = await unwrapRoomKey(bob.privateKey, alice.publicKey, wrapped, roomId, keyId, 'bob');
    expect(received).toEqual(raw);
    await expect(unwrapRoomKey(bob.privateKey, alice.publicKey, wrapped, roomId, keyId, 'eve')).rejects.toThrow();

    const key = await importRoomKey(received);
    const envelope = await sealText(key, keyId, `${roomId}|m1`, 'مرحبا @ليلى https://example.com');
    expect(sealedKeyId(envelope)).toBe(keyId);
    expect(envelope).not.toContain('مرحبا');
    expect(await openText(key, envelope, `${roomId}|m1`)).toBe('مرحبا @ليلى https://example.com');
    await expect(openText(key, envelope, `${roomId}|m2`)).rejects.toThrow();
    expect(sealedKeyId(await sealText(key, keyId, 'x', ''))).toBe(keyId);

    const bytes = new Uint8Array([0, 255, 1, 254, 9]);
    const sealed = await sealBytes(key, `${roomId}|m1|media`, bytes);
    expect(sealed.length).toBe(bytes.length + 28);
    expect(await openBytes(key, `${roomId}|m1|media`, sealed)).toEqual(bytes);
  }, 30_000);
});
