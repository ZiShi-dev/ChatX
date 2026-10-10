const TITLE_LIMIT = 120;
const DESCRIPTION_LIMIT = 180;
const PAGE_BYTES = 200_000;
const IMAGE_BYTES = 120_000;
const HOP_LIMIT = 4;

export type LinkCard = { title: string; description: string; image: string };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type LookupLike = (host: string) => Promise<string[]>;

export function privateAddress(ip: string) {
  const mapped = ip.toLowerCase().startsWith('::ffff:') ? ip.slice(7) : ip;
  const lower = mapped.toLowerCase();
  if (lower === '::1' || lower === '::' || lower === '0.0.0.0' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('ff')) return true;
  const parts = mapped.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function publicPageUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.username || url.password || (url.protocol !== 'https:' && url.protocol !== 'http:')) return null;
  if (url.port && url.port !== '80' && url.port !== '443') return null;
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || privateAddress(host)) return null;
  url.hash = '';
  return url;
}

function decodeEntities(value: string) {
  return value
    .replace(/&#(\d{1,7});/g, (_, code: string) => {
      const point = Number(code);
      return point > 0 && point < 0x110000 ? String.fromCodePoint(point) : '';
    })
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, code: string) => {
      const point = Number.parseInt(code, 16);
      return point > 0 && point < 0x110000 ? String.fromCodePoint(point) : '';
    })
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clip(value: string, limit: number) {
  return [...decodeEntities(value)].slice(0, limit).join('').trim();
}

function metaContent(html: string, key: string) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = [...tag.matchAll(/([:\w-]+)\s*=\s*("([^"]*)"|'([^']*)')/gi)];
    const read = (name: string) => {
      const found = attrs.find((attr) => attr[1]?.toLowerCase() === name);
      return found?.[3] ?? found?.[4] ?? '';
    };
    const name = `${read('property')} ${read('name')}`.toLowerCase();
    if (name.split(/\s+/).includes(key)) return read('content');
  }
  return '';
}

export function readPagePreview(html: string, page: URL): { title: string; description: string; image: string } {
  const title = clip(metaContent(html, 'og:title') || metaContent(html, 'twitter:title') || html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '', TITLE_LIMIT);
  const description = clip(metaContent(html, 'og:description') || metaContent(html, 'twitter:description') || metaContent(html, 'description'), DESCRIPTION_LIMIT);
  const raw = metaContent(html, 'og:image') || metaContent(html, 'twitter:image');
  let image = '';
  if (raw) {
    try { image = new URL(decodeEntities(raw), page).href; } catch { image = ''; }
  }
  return { title, description, image };
}

function imageKind(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return '';
}

async function readLimited(response: Response, max: number, keepPartial: boolean) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < max) {
    const step = await reader.read();
    if (step.done) break;
    const room = max - size;
    if (step.value.byteLength > room) {
      await reader.cancel().catch(() => undefined);
      if (!keepPartial) return null;
      chunks.push(step.value.subarray(0, room));
      size += room;
      break;
    }
    chunks.push(step.value);
    size += step.value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function pull(start: URL, accept: string, max: number, fetchImpl: FetchLike, lookup: LookupLike) {
  let current = start;
  for (let hop = 0; hop < HOP_LIMIT; hop += 1) {
    const addresses = await lookup(current.hostname).catch(() => []);
    if (!addresses.length || addresses.some((address) => privateAddress(address))) return null;
    const response = await fetchImpl(current.href, {
      redirect: 'manual',
      headers: { accept, 'user-agent': 'ChatXLinkPreview/1.0' },
      signal: AbortSignal.timeout(4000),
    });
    if (response.status >= 300 && response.status < 400) {
      const next = publicPageUrl(new URL(response.headers.get('location') ?? '', current).href);
      await response.body?.cancel().catch(() => undefined);
      if (!next) return null;
      current = next;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const bytes = await readLimited(response, max, accept.startsWith('text/html'));
    if (!bytes) return null;
    return { url: current, type: response.headers.get('content-type') ?? '', bytes };
  }
  return null;
}

export async function loadLinkCard(target: string, fetchImpl: FetchLike, lookup: LookupLike): Promise<LinkCard | null> {
  const page = publicPageUrl(target);
  if (!page) return null;
  const loaded = await pull(page, 'text/html,application/xhtml+xml,image/jpeg,image/png,image/webp,image/gif', PAGE_BYTES, fetchImpl, lookup);
  if (!loaded) return null;
  const kind = imageKind(loaded.bytes);
  if (kind) {
    return { title: loaded.url.hostname.replace(/^www\./, ''), description: '', image: `data:${kind};base64,${Buffer.from(loaded.bytes).toString('base64')}` };
  }
  const html = new TextDecoder().decode(loaded.bytes);
  const preview = readPagePreview(html, loaded.url);
  const imageUrl = publicPageUrl(preview.image);
  let image = '';
  if (imageUrl) {
    const file = await pull(imageUrl, 'image/jpeg,image/png,image/webp,image/gif', IMAGE_BYTES, fetchImpl, lookup);
    const fileKind = file ? imageKind(file.bytes) : '';
    if (file && fileKind) image = `data:${fileKind};base64,${Buffer.from(file.bytes).toString('base64')}`;
  }
  const host = loaded.url.hostname.replace(/^www\./, '');
  return { title: preview.title || host, description: preview.description, image };
}

const cache = new Map<string, { at: number; card: LinkCard }>();

export async function cachedLinkCard(target: string, fetchImpl: FetchLike = fetch, lookup?: LookupLike) {
  const page = publicPageUrl(target);
  if (!page) return null;
  const key = page.href;
  const hit = cache.get(key);
  if (hit && hit.at > Date.now() - 30 * 60_000) return hit.card;
  const { lookup: dnsLookup } = await import('node:dns/promises');
  const resolve = lookup ?? (async (host: string) => (await dnsLookup(host, { all: true, verbatim: true })).map((row) => row.address));
  const card = await loadLinkCard(key, fetchImpl, resolve);
  if (!card) return null;
  cache.delete(key);
  cache.set(key, { at: Date.now(), card });
  while (cache.size > 40) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    cache.delete(oldest);
  }
  return card;
}
