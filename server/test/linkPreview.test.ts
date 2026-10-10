import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadLinkCard, privateAddress, publicPageUrl, readPagePreview } from '../src/linkPreview.ts';

test('rejects local and private link targets', () => {
  assert.equal(privateAddress('127.0.0.1'), true);
  assert.equal(privateAddress('10.1.2.3'), true);
  assert.equal(privateAddress('192.168.1.8'), true);
  assert.equal(privateAddress('8.8.8.8'), false);
  assert.equal(publicPageUrl('http://127.0.0.1/secret'), null);
  assert.equal(publicPageUrl('https://localhost/admin'), null);
  assert.equal(publicPageUrl('file:///etc/passwd'), null);
  assert.equal(publicPageUrl('https://example.com/guide')?.href, 'https://example.com/guide');
});

test('reads the title, description and image from a page', () => {
  const page = new URL('https://example.com/story');
  const preview = readPagePreview(`
    <html><head>
      <meta property="og:title" content="عنوان الصفحة">
      <meta name="description" content="وصف قصير">
      <meta property="og:image" content="/cover.jpg">
    </head></html>
  `, page);
  assert.equal(preview.title, 'عنوان الصفحة');
  assert.equal(preview.description, 'وصف قصير');
  assert.equal(preview.image, 'https://example.com/cover.jpg');
});

test('loads a card and keeps a small image', async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const fetchImpl = async (input: string) => {
    if (input.endsWith('/cover.jpg')) return new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } });
    return new Response('<meta property="og:title" content="Hello"><meta property="og:image" content="https://cdn.example/cover.jpg">', {
      headers: { 'content-type': 'text/html' },
    });
  };
  const card = await loadLinkCard('https://example.com/a', fetchImpl, async () => ['93.184.216.34']);
  assert.equal(card?.title, 'Hello');
  assert.equal(card?.image.startsWith('data:image/jpeg;base64,'), true);
});

test('does not fetch a private address', async () => {
  let called = false;
  const card = await loadLinkCard('https://example.com/a', async () => {
    called = true;
    return new Response('no');
  }, async () => ['127.0.0.1']);
  assert.equal(card, null);
  assert.equal(called, false);
});
