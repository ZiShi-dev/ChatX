const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

export function isSafeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return SAFE_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}
