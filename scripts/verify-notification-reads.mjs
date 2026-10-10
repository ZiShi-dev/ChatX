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
const repo = createMemoryRepository(); let clock = Date.now();
const alice = { id: '11111111-1111-4111-8111-111111111111', email: 'alice@test.invalid', username: 'Alice', displayName: 'Alice', role: 'member', bio: '', avatarUrl: null, bannerUrl: null };
const bob = { ...alice, id: '22222222-2222-4222-8222-222222222222', email: 'bob@test.invalid', username: 'Bob', displayName: 'Bob' };
for (const person of [alice, bob]) { await repo.insertUser(person); await repo.ensureHome(person.id); }
await repo.createSession(hashSession('read-test'), alice.id, new Date(clock + 600000));
const roomId = '00000000-0000-4000-8000-000000000001';
async function publish(at, text) {
  const message = { id: randomUUID(), roomId, senderId: bob.id, text, createdAt: new Date(at), deleted: false, event: true };
  await repo.addRoomMessage(message); await repo.notifyTurnMembers(message); return message.id;
}
const old = await publish(clock - 1000, 'تنبيه قديم');
const config = loadConfig({ DATABASE_URL: 'unused' });
const api = createApi({ repo, config, now: () => clock, rateLimit: createLimiter(config, () => clock) });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHATX_CHROME_PATH });
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 640 }, permissions: ['notifications'] });
  await context.addInitScript(alice => localStorage.setItem('chatx.auth', JSON.stringify({ activated: true, currentUser: alice, accounts: [alice] })), alice);
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let offline = false; let loseAck = true; let writes = 0;
  await page.route('**/api/**', async route => {
    if (offline) return route.abort();
    const request = route.request();
    await new Promise(resolve => setTimeout(resolve, 150));
    const response = await api(new Request(request.url(), { method: request.method(), headers: { ...request.headers(), cookie: 'chatx_session=read-test' }, body: request.postDataBuffer() || undefined }));
    if (new URL(request.url()).pathname === '/api/notifications/read') {
      writes++;
      if (loseAck) { loseAck = false; return route.abort(); }
    }
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  await page.goto('http://127.0.0.1:4186/notifications');
  await prepareTestIdentity(page, alice.id, publicKey => repo.saveUserKeys(alice.id, publicKey, { salt: 'a'.repeat(22), iv: 'a'.repeat(16), data: 'a'.repeat(32), iterations: 100000 }, false));
  await page.locator('.inbox-row.is-unread').first().waitFor();
  await page.locator('.startup-screen').waitFor({ state: 'detached' });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })); });
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  offline = true; await context.setOffline(true);
  await page.getByRole('button', { name: 'قراءة الكل', exact: true }).click();
  assert.equal(await page.locator('.inbox-row.is-unread').count(), 0);
  await page.reload(); await page.locator('.inbox-row.is-read').first().waitFor().catch(async error => { console.log(await page.evaluate(() => ({ text: document.body.innerText, pending: Object.entries(localStorage).filter(([key]) => key.includes('pendingReads')) }))); throw error; });
  assert.equal(await page.locator('.inbox-row.is-unread').count(), 0);
  clock += 2000; const newer = await publish(clock, 'تنبيه جديد بعد القراءة');
  offline = false; await context.setOffline(false);
  for (let index = 0; index < 150; index++) {
    const pending = await page.evaluate(owner => JSON.parse(localStorage.getItem(`chatx.pendingReads.v1.${owner}`) || '{}'), alice.id);
    if (!pending.allUntil && writes >= 2) break;
    await page.waitForTimeout(100);
  }
  const notices = await repo.listNotifications(alice.id, 30, null);
  assert.equal(await page.evaluate(owner => Boolean(JSON.parse(localStorage.getItem(`chatx.pendingReads.v1.${owner}`) || '{}').allUntil), alice.id), false);
  assert.equal(notices.find(item => item.messageId === old)?.read, true);
  assert.equal(notices.find(item => item.messageId === newer)?.read, false);
  assert.ok(writes >= 2 && writes <= 4, `Unexpected retry burst: ${writes}`);
  await page.reload(); await page.locator('.inbox-row.is-unread').first().waitFor();
  assert.deepEqual(errors, []);
  console.log(`PASS offline read + reload, lost acknowledgement retry, future notification remains unread, CPU 6x, ${writes} bounded writes`);
} finally { await browser.close(); }
