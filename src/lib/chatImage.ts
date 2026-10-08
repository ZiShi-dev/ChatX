const IMAGE_URL_MAX = 80_000;
const IMAGE_BYTES_MAX = 60_000;
const JPEG_PREFIX = 'data:image/jpeg;base64,/9j/';

export function jpegDataUrl(bytes: Uint8Array): string | null {
  if (bytes.length < 3 || bytes.length > IMAGE_BYTES_MAX) return null;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x4000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x4000));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

function readyJpeg(source: string) {
  if (!source.startsWith(JPEG_PREFIX) || source.length > IMAGE_URL_MAX) return null;
  const data = source.slice('data:image/jpeg;base64,'.length);
  if (data.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
  const pad = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  const size = Math.floor((data.length * 3) / 4) - pad;
  if (size < 3 || size > IMAGE_BYTES_MAX) return null;
  return size;
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth > 0 && image.naturalHeight > 0 ? image : null);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

function drawJpeg(image: HTMLImageElement, edge: number, quality: number) {
  const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, 0, 0, width, height);
  return { url: canvas.toDataURL('image/jpeg', quality), width, height };
}

export async function fitChatImage(source: string, qualityLevel: 'saver' | 'medium' | 'original' = 'saver'): Promise<{ url: string; bytes: number; width: number; height: number } | null> {
  const ready = readyJpeg(source);
  if (ready) return { url: source, bytes: ready, width: 0, height: 0 };
  const image = await loadImage(source);
  if (!image || image.naturalWidth * image.naturalHeight > 24_000_000) return null;
  let edge = qualityLevel === 'saver' ? 640 : qualityLevel === 'medium' ? 800 : 960;
  let quality = qualityLevel === 'saver' ? 0.58 : qualityLevel === 'medium' ? 0.66 : 0.72;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const drawn = drawJpeg(image, edge, quality);
    const bytes = drawn ? readyJpeg(drawn.url) : null;
    if (drawn && bytes) return { url: drawn.url, bytes, width: drawn.width, height: drawn.height };
    edge = Math.round(edge * 0.75);
    quality = Math.max(0.45, quality - 0.08);
  }
  return null;
}
