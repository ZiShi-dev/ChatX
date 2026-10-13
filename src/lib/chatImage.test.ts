import { afterEach, expect, it, vi } from 'vitest';
import { fitChatImage, jpegDataUrl } from './chatImage';

vi.mock('./deviceBudget', () => ({ yieldToInterface: async () => undefined }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function jpeg(size: number) {
  const bytes = new Uint8Array(size).fill(1);
  bytes.set([255, 216, 255]);
  return jpegDataUrl(bytes)!;
}
function image() {
  vi.stubGlobal('Image', class {
    naturalWidth = 4000; naturalHeight = 3000;
    onload?: () => void;
    set src(_source: string) { queueMicrotask(() => this.onload?.()); }
  });
}
it('preserves a compatible full-size JPEG in HD rather than recompressing it to 60 KB', async () => {
  image();
  const source = jpeg(300_000);
  expect(await fitChatImage(source, 'hd')).toEqual({ url: source, bytes: 300_000, width: 4000, height: 3000 });
});
it('keeps the saver mode small while starting its resize from the full-resolution image', async () => {
  image();
  const draw = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ drawImage: draw }) as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(jpeg(10_000));
  const result = await fitChatImage(jpeg(300_000), 'saver');
  expect(result).toMatchObject({ bytes: 10_000, width: 640, height: 480 });
  expect(draw).toHaveBeenCalled();
});
it('caps JPEG transport at 2 MiB', () => {
  expect(jpegDataUrl(new Uint8Array(2 * 1024 * 1024 + 1))).toBeNull();
});
