import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createApi } from '../server/src/http.ts';
import { createMemoryRepository } from '../server/src/memory.ts';
import { createLimiter } from '../server/src/authService.ts';
import { loadConfig } from '../server/src/config.ts';
import { hashSession } from '../server/src/session.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATX_PLAYWRIGHT_PATH || 'playwright');
const repo = createMemoryRepository();
const alice = { id: '11111111-1111-4111-8111-111111111111', email: 'alice@test.invalid', username: 'Alice', displayName: 'Alice', role: 'member', bio: '', avatarUrl: null, bannerUrl: null };
await repo.insertUser(alice); await repo.ensureHome(alice.id);
await repo.createSession(hashSession('image-test'), alice.id, new Date(Date.now() + 600000));
const config = loadConfig({ DATABASE_URL: 'unused' });
const api = createApi({ repo, config, now: () => Date.now(), rateLimit: createLimiter(config, () => Date.now()) });
const roomId = '00000000-0000-4000-8000-000000000001';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHATX_CHROME_PATH });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 780 }, permissions: ['notifications'] });
  await context.addInitScript(alice => localStorage.setItem('chatx.auth', JSON.stringify({ activated: true, currentUser: alice, accounts: [alice] })), alice);
  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') console.log('BROWSER', message.text()); });
  await page.route('**/api/**', async route => {
    const request = route.request(); const headers = { ...request.headers(), cookie: 'chatx_session=image-test' };
    const response = await api(new Request(request.url(), { method: request.method(), headers, body: request.postDataBuffer() || undefined }));
    if (response.status >= 400) console.log('API', request.method(), new URL(request.url()).pathname, response.status);
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  await page.goto(`http://127.0.0.1:4186/chat/${roomId}`);
  await page.getByPlaceholder('اكتب رسالة').waitFor();
  const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#123456'; ctx.fillRect(0, 0, 800, 600); return canvas.toDataURL('image/png').split(',')[1]; });
  await page.locator('input[type=file][accept*="image"]').first().setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.getByRole('button', { name: 'إرسال', exact: true }).click();
  let messages = [];
  for (let index = 0; index < 100; index++) {
    messages = await repo.listRoomMessages(roomId, alice.id, 30);
    if (messages.some(message => message.imageSize)) break;
    await page.waitForTimeout(100);
  }
  assert.ok(messages.some(message => message.imageSize), 'Image failed to upload');
  const message = messages.find(message => message.imageSize);
  const response = await api(new Request(`http://localhost/api/rooms/${roomId}/messages/${message.id}/image`, { headers: { cookie: 'chatx_session=image-test' } }));
  assert.equal(response.status, 200);
  await page.reload(); await page.getByPlaceholder('اكتب رسالة').waitFor();
  const download = page.getByRole('button', { name: 'تحميل', exact: true });
  if (await download.count()) await download.first().click();
  await page.waitForFunction(() => [...document.querySelectorAll('.bubble img')].some(img => img.complete && img.naturalWidth > 0));
  console.log('PASS real JPEG preparation, resumable image upload, authenticated download and display after reload');
} finally { await browser.close(); }
