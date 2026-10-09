import { it } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { createMemoryRepository } from '../src/memory.ts';
import { compressJson } from '../src/compression.ts';
import { verifyLowBandwidth } from './lowBandwidthCases.ts';

it('synchronizes changes and resumes binary uploads without duplicate messages', async () => { await verifyLowBandwidth(createMemoryRepository()); });
it('negotiates JSON compression and respects excluded encodings', async () => {
  const body = JSON.stringify({ messages: Array.from({length:100},()=>({text:'hello world'})) });
  for (const encoding of ['gzip','br']) {
    const response = await compressJson(new Response(body,{headers:{'content-type':'application/json'}}),encoding);
    assert.equal(response.headers.get('content-encoding'),encoding);
    const compressed = Buffer.from(await response.arrayBuffer()); assert.ok(compressed.length<body.length);
    assert.equal((encoding==='br'?brotliDecompressSync(compressed):gunzipSync(compressed)).toString(),body);
  }
  const excluded = await compressJson(new Response(body,{headers:{'content-type':'application/json'}}),'gzip;q=0, br;q=0');
  assert.equal(excluded.headers.get('content-encoding'),null);
});
