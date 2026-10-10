export const FILE_BYTES_MAX = 262_144;
export const VIDEO_BYTES_MAX = 8 * 1024 * 1024;

export async function localMediaBytes(source: string): Promise<Uint8Array> {
  if (source.startsWith('data:')) {
    const comma = source.indexOf(',');
    if (comma < 0 || !source.slice(0, comma).endsWith(';base64')) throw new Error('invalid_media');
    return Uint8Array.from(atob(source.slice(comma + 1)), (character) => character.charCodeAt(0));
  }
  const response = await fetch(source);
  if (!response.ok) throw new Error('read');
  return new Uint8Array(await response.arrayBuffer());
}

export function clipFileName(value: string) {
  const parts = value
    // eslint-disable-next-line no-control-regex -- Strip control characters from untrusted input.
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..');
  const name = parts.join('/');
  if (!name) return 'fichier';
  return name.length <= 120 ? name : name.slice(-120);
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x4000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x4000));
  }
  return btoa(binary);
}
