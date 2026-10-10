import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createApi } from '../server/src/http.ts';
import { createMemoryRepository } from '../server/src/memory.ts';
import { createLimiter } from '../server/src/authService.ts';
import { loadConfig } from '../server/src/config.ts';
import { hashSession } from '../server/src/session.ts';
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
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
  await context.addInitScript(alice => localStorage.setItem('chatx.auth', JSON.stringify({ activated: true, currentUser: alice, accounts: [alice] })), alice);
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let inboxReads = 0;
  await page.route('**/api/**', async route => {
    const request = route.request();
    if (new URL(request.url()).pathname === '/api/notifications') inboxReads++;
    const response = await api(new Request(request.url(), { method: request.method(), headers: { ...request.headers(), cookie: 'chatx_session=live-test' }, body: request.postDataBuffer() || undefined }));
    if (response.status >= 400) console.log('API failure', new URL(request.url()).pathname, response.status, await response.clone().text());
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  await page.goto(`http://127.0.0.1:4186/chat/${groupId}`);
  // Use an already configured account; recovery-code setup has separate tests.
  const publicKey = await page.evaluate(async owner => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    const publicKey = btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('chatx-keys-v1', 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('keys')) request.result.createObjectStore('keys', { keyPath: 'key' }); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('keys', 'readwrite'); tx.objectStore('keys').put({ key: `id:${owner}`, privateKey: pair.privateKey, publicKey });
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close(); return publicKey;
  }, alice.id);
  await repo.saveUserKeys(alice.id, publicKey, { salt: 'a'.repeat(22), iv: 'a'.repeat(16), data: 'a'.repeat(32), iterations: 100000 }, false);
  await page.reload();
  const later = page.getByRole('button', { name: 'ليس الآن', exact: true });
  if (await later.count()) await later.click();
  await page.getByPlaceholder('اكتب رسالة').waitFor().catch(async error => { console.log((await page.locator('body').innerText()).slice(-1200)); throw error; });
  await page.locator('.startup-screen').waitFor({ state: 'detached' });
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await page.getByRole('button', { name: 'إيموجي', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'البحث عن إيموجي' });
  await search.fill('rire');
  await page.getByRole('option', { name: '😂', exact: true }).click();
  await page.getByRole('option', { name: '😂', exact: true }).click();
  assert.equal(await page.getByPlaceholder('اكتب رسالة').inputValue(), '😂😂');
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('composer-input')), false);
  await page.getByRole('button', { name: 'إغلاق الإيموجي' }).click();
  await page.getByRole('button', { name: 'إيموجي', exact: true }).click();
  await page.getByRole('tab', { name: 'الأخيرة', exact: true }).waitFor();
  assert.equal(await page.getByRole('tab', { name: 'الأخيرة', exact: true }).getAttribute('aria-selected'), 'true');
  await page.getByRole('button', { name: 'إغلاق الإيموجي' }).click();
  while (!inboxReads) await page.waitForTimeout(50);
  await page.waitForTimeout(200);
  const message = { id: randomUUID(), roomId: privateId, senderId: bob.id, text: 'Private live message', createdAt: new Date(), deleted: false };
  await repo.addRoomMessage(message); await repo.notifyRoomMessage(message);
  const banner = page.locator('.live-inbox-banner');
  await banner.filter({ hasText: 'Private live message' }).waitFor({ timeout: 22000 });
  assert.ok((await banner.innerText()).includes('Private live message'));
  assert.ok(page.url().includes(groupId));
  assert.equal((await repo.listNotifications(alice.id, 30, null)).find(item => item.messageId === message.id)?.read, false);
  await page.locator('.live-inbox-open').click();
  await page.waitForURL(`**/chat/${privateId}?at=${message.id}`);
  await page.waitForTimeout(500);
  const second = { ...message, id: randomUUID(), text: 'Current chat live message', createdAt: new Date() };
  await repo.addRoomMessage(second); await repo.notifyRoomMessage(second);
  await banner.waitFor({ timeout: 22000 });
  assert.ok((await banner.innerText()).includes('Current chat live message'));
  await page.getByRole('button', { name: 'إخفاء الإشعار' }).click();
  assert.deepEqual(errors, []);
  console.log('PASS repeated emoji picks, cursor/keyboard stability, private recent emoji, and live private banner from a group without premature reads; CPU 6x');
} finally { await browser.close(); }
