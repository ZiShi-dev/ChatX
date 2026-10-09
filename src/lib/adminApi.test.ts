import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminFetch, adminFetchBlob, invalidateApiSession } from './adminApi';

afterEach(() => {
  invalidateApiSession();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('API reliability', () => {
  it('cancels a request immediately on a phone disconnection', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('disconnected')));
    })));
    const result = adminFetch('/api/home').catch((error: unknown) => error);
    window.dispatchEvent(new Event('offline'));
    expect(await result).toMatchObject({ code: 'offline' });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('reuses validated JSON without downloading it twice or sharing mutable objects', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{"users":[{"name":"Alice"}]}', { headers: { etag: '"v1"' } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    vi.stubGlobal('fetch', fetchMock);
    const first = await adminFetch('/api/home') as { users: Array<{ name: string }> };
    first.users[0].name = 'Changed locally';
    expect(await adminFetch('/api/home')).toEqual({ users: [{ name: 'Alice' }] });
    expect(fetchMock.mock.calls[1][1].headers.get('if-none-match')).toBe('"v1"');
  });
  it('does not reuse a previous account response after invalidation or on authorization failure', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{"name":"Alice"}', { headers: { etag: '"v1"' } }))
      .mockResolvedValueOnce(new Response('{"error":"forbidden"}', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    await adminFetch('/api/home');
    invalidateApiSession();
    await expect(adminFetch('/api/home')).rejects.toMatchObject({ code: 'forbidden' });
    expect(fetchMock.mock.calls[1][1].headers.has('if-none-match')).toBe(false);
  });
  it('evicts older validated responses to keep the memory cache bounded', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { headers: { etag: '"v1"' } }));
    vi.stubGlobal('fetch', fetchMock);
    for (let index = 0; index < 17; index += 1) await adminFetch(`/api/rooms/${index}`);
    await adminFetch('/api/rooms/0');
    const lastCall = fetchMock.mock.calls.at(-1) as [string, { headers: Headers }] | undefined;
    expect(lastCall?.[1].headers.has('if-none-match')).toBe(false);
  });
  it('aborts a stalled send without retrying a mutation', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const result = adminFetch('/api/rooms/example/messages', { method: 'POST', body: { text: 'hello' } }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toMatchObject({ code: 'offline', status: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps server errors and clears the request timer', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"forbidden"}', { status: 403 })));
    await expect(adminFetch('/api/home')).rejects.toMatchObject({ code: 'forbidden', status: 403 });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('also bounds the download of a response body', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => ({
      ok: true,
      blob: () => new Promise<Blob>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
    })));
    const result = adminFetchBlob('/api/rooms/example/messages/example/file').catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await result).toMatchObject({ code: 'offline' });
    expect(vi.getTimerCount()).toBe(0);
  });
});
