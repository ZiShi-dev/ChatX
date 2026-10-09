import { brotliCompress, gzip, constants } from 'node:zlib';
import { promisify } from 'node:util';
const br = promisify(brotliCompress);
const gz = promisify(gzip);

export async function compressJson(response: Response, accepted: string | null) {
  if (!response.headers.get('content-type')?.startsWith('application/json')) return response;
  const headers = new Headers(response.headers); headers.append('vary', 'Accept-Encoding');
  if (response.status === 304 || !accepted) return new Response(response.body, { status: response.status, headers });
  const qualities = new Map(accepted.toLowerCase().split(',').map((part) => {
    const [name, ...params] = part.trim().split(';'); const q = params.find((value) => value.trim().startsWith('q='));
    return [name!, q ? Number(q.trim().slice(2)) : 1] as const;
  }));
  const quality = (name: string) => qualities.get(name) ?? qualities.get('*') ?? 0;
  const encoding = quality('br') > 0 && quality('br') >= quality('gzip') ? 'br' : quality('gzip') > 0 ? 'gzip' : null;
  if (!encoding) return new Response(response.body, { status: response.status, headers });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1024) return new Response(bytes, { status: response.status, headers });
  const compressed = encoding === 'br' ? await br(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }) : await gz(bytes, { level: 4 });
  if (compressed.length >= bytes.length) return new Response(bytes, { status: response.status, headers });
  headers.set('content-encoding', encoding); headers.delete('content-length');
  return new Response(compressed, { status: response.status, headers });
}
