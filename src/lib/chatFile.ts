export const FILE_BYTES_MAX = 262_144;

export function clipFileName(value: string) {
  const parts = value
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
