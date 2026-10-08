import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminFetch, adminFetchBlob } from './adminApi';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('API reliability', () => {
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
