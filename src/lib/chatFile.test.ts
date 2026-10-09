import { afterEach, expect, it, vi } from 'vitest';
import { localMediaBytes } from './chatFile';

afterEach(() => vi.unstubAllGlobals());
it('reads durable binary attachments locally without CSP-blocked data URL requests', async () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  expect([...await localMediaBytes('data:application/octet-stream;base64,AP+A')]).toEqual([0,255,128]);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('rejects an invalid local media encoding', async () => {
  await expect(localMediaBytes('data:application/octet-stream,invalid')).rejects.toThrow('invalid_media');
});
