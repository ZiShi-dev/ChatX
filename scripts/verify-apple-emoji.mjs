import { publishTyping, roomTyping } from '../server/src/typing.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createApi } from '../server/src/http.ts';
import { createMemoryRepository } from '../server/src/memory.ts';
import { createLimiter } from '../server/src/authService.ts';
import { loadConfig } from '../server/src/config.ts';
import { hashSession } from '../server/src/session.ts';
import { prepareTestIdentity } from './browser-test-keys.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATX_PLAYWRIGHT_PATH || 'playwright');
const repo = createMemoryRepository();
const alice = { id: randomUUID(), email: 'alice@test.invalid', username: 'Alice', displayName: 'Alice', role: 'member', bio: '', avatarUrl: null, bannerUrl: null };
const bob = { ...alice, id: randomUUID(), email: 'bob@test.invalid', username: 'Bob', displayName: 'Bob' };
for (const person of [alice, bob]) { await repo.insertUser(person); await repo.ensureHome(person.id); }
const privateId = randomUUID(), groupId = '00000000-0000-4000-8000-000000000001';
await repo.createRoom({ id: privateId, kind: 'private', name: null, creatorId: alice.id, memberIds: [bob.id], at: new Date() });
await repo.createSession(hashSession('live-test'), alice.id, new Date(Date.now() + 600000));
const config = loadConfig({ DATABASE_URL: 'unused' });
const api = createApi({ repo, config, now: () => Date.now(), rateLimit: createLimiter(config, () => Date.now()) });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHATX_CHROME_PATH });
let releaseRead;
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
  await context.addInitScript(alice => localStorage.setItem('chatx.auth', JSON.stringify({ activated: true, currentUser: alice, accounts: [alice] })), alice);
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let inboxReads = 0;
  let delayedMessageId = '', readStarted = false;
  const delayedAck = new Promise(resolve => { releaseRead = resolve; });
  await page.route('**/api/**', async route => {
    const request = route.request();
    if (new URL(request.url()).pathname === '/api/notifications') inboxReads++;
    const response = await api(new Request(request.url(), { method: request.method(), headers: { ...request.headers(), cookie: 'chatx_session=live-test' }, body: request.postDataBuffer() || undefined }));
    if (new URL(request.url()).pathname === `/api/rooms/${privateId}/read` && request.postDataJSON()?.messageId === delayedMessageId) {
      readStarted = true;
      await delayedAck;
    }
    if (response.status >= 400) console.log('API failure', new URL(request.url()).pathname, response.status, await response.clone().text());
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  await page.goto(`http://127.0.0.1:4186/chat/${groupId}`);
  await prepareTestIdentity(page, alice.id, publicKey => repo.saveUserKeys(alice.id, publicKey, { salt: 'a'.repeat(22), iv: 'a'.repeat(16), data: 'a'.repeat(32), iterations: 100000 }, false));
  await page.getByPlaceholder('اكتب رسالة').waitFor().catch(async error => { console.log((await page.locator('body').innerText()).slice(-1200)); throw error; });
  await page.locator('.startup-screen').waitFor({ state: 'detached' });
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await page.getByRole('button', { name: 'إيموجي', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'البحث عن إيموجي' });
  await search.fill('rire');
  const picture = page.getByRole('option', { name: '😂', exact: true }).locator('img');
  assert.ok((await picture.getAttribute('src')).includes('apple-complete-v3'));
  await picture.evaluate(img => img.decode());
  await page.screenshot({ path: 'docs/apple-emoji-picker-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('PASS local Apple emoji image decoded in the picker with 6x CPU throttling');
} finally { releaseRead?.(); await browser.close(); }
