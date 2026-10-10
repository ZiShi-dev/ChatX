import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createApi } from '../server/src/http.ts';
import { createMemoryRepository } from '../server/src/memory.ts';
import { createLimiter } from '../server/src/authService.ts';
import { loadConfig } from '../server/src/config.ts';
import { hashSession } from '../server/src/session.ts';
import { prepareTestIdentity } from './browser-test-keys.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATX_PLAYWRIGHT_PATH || 'playwright');
const repo = createMemoryRepository(), origin = 'http://127.0.0.1:4186';
const alice = { id: '11111111-1111-4111-8111-111111111111', email: 'alice@test.invalid', username: 'Alice', displayName: 'Alice', role: 'member', bio: '', avatarUrl: null, bannerUrl: null };
const bob = { ...alice, id: '22222222-2222-4222-8222-222222222222', email: 'bob@test.invalid', username: 'Bob', displayName: 'Bob' };
for (const person of [alice, bob]) { await repo.insertUser(person); await repo.ensureHome(person.id); await repo.createSession(hashSession(person.id), person.id, new Date(Date.now() + 600000)); }
const config = loadConfig({ DATABASE_URL: 'unused' });
const api = createApi({ repo, config, now: () => Date.now(), rateLimit: createLimiter(config, () => Date.now()) });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHATX_CHROME_PATH });
const errors = [], external = [];
async function account(person, path) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['notifications'] });
  await context.addInitScript(person => {
    localStorage.setItem('chatx.auth', JSON.stringify({ activated: true, currentUser: person, accounts: [person] }));
    if (!localStorage.getItem('chatx.settings')) localStorage.setItem('chatx.settings', JSON.stringify({ dataSaver: false }));
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, get: () => 8 });
  }, person);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().startsWith('http') && !request.url().startsWith(origin)) external.push(request.url()); });
  await page.route('**/api/**', async route => {
    const request = route.request();
    const response = await api(new Request(request.url(), { method: request.method(), headers: { ...request.headers(), cookie: `chatx_session=${person.id}` }, body: request.postDataBuffer() || undefined }));
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  await page.goto(origin + path);
  await prepareTestIdentity(page, person.id, publicKey => repo.saveUserKeys(person.id, publicKey, { salt: 'a'.repeat(22), iv: 'a'.repeat(16), data: 'a'.repeat(32), iterations: 100000 }, false));
  await page.locator('.startup-screen').waitFor({ state: 'detached' });
  return page;
}
try {
  const page = await account(alice, '/account');
  await page.getByRole('button', { name: 'تعديل الملف', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByRole('button', { name: 'قبعة الخيزران', exact: true }).click();
  await editor.getByRole('button', { name: 'نجوم', exact: true }).click();
  assert.equal(await editor.locator('.cosmetic-preview .decoration-hat').count(), 1);
  assert.equal(await editor.locator('.effect-stars').count(), 1);
  await editor.getByRole('button', { name: 'حفظ', exact: true }).click();
  await editor.waitFor({ state: 'detached' });
  assert.equal((await repo.findUserById(alice.id)).avatarDecoration, 'hat');
  assert.equal((await repo.findUserById(alice.id)).profileEffect, 'stars');
  await page.reload(); await page.locator('.startup-screen').waitFor({ state: 'detached' }); await page.locator('.profile-hero .decoration-hat').waitFor();
  const hat = page.locator('.profile-hero .decoration-hat');
  assert.equal(await hat.evaluate(node => getComputedStyle(node, '::after').animationName), 'profile-hat');
  await page.screenshot({ path: 'docs/profile-hat-mobile.png', fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await hat.evaluate(node => getComputedStyle(node, '::after').animationName), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: 'docs/profile-hat-desktop.png', fullPage: true });
  await page.evaluate(() => localStorage.setItem('chatx.settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('chatx.settings')), dataSaver: true })));
  await page.reload(); await page.locator('.startup-screen').waitFor({ state: 'detached' }); await hat.waitFor();
  assert.equal(await hat.evaluate(node => getComputedStyle(node, '::after').animationName), 'none');
  // A second account sees the same decoration on the author's avatar and profile.
  const roomId = '00000000-0000-4000-8000-000000000001';
  await repo.addRoomMessage({ id: '33333333-3333-4333-8333-333333333333', roomId, senderId: alice.id, text: 'Profile decoration fixture', createdAt: new Date(), deleted: false });
  const viewer = await account(bob, `/chat/${roomId}`);
  await viewer.getByText('Profile decoration fixture', { exact: true }).waitFor();
  assert.equal(await viewer.locator('.decoration-hat.is-animated').count(), 0);
  await viewer.getByRole('button', { name: 'Alice', exact: true }).first().click();
  await viewer.locator('.member-sheet .decoration-hat').waitFor();
  assert.equal(await viewer.locator('.member-sheet .effect-stars').count(), 1);
  // Cancel retains the saved choice; the explicit none choice removes it.
  await page.getByRole('button', { name: 'تعديل الملف', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'بدون إطار', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'إلغاء', exact: true }).click();
  assert.equal((await repo.findUserById(alice.id)).avatarDecoration, 'hat');
  await page.getByRole('button', { name: 'تعديل الملف', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'بدون إطار', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'بدون تأثير', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'حفظ', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.reload(); await page.locator('.startup-screen').waitFor({ state: 'detached' }); await page.locator('.profile-hero h1').waitFor();
  assert.equal(await page.locator('.profile-hero .avatar-frame, .profile-hero .profile-effect').count(), 0);
  assert.equal((await repo.findUserById(bob.id)).avatarDecoration ?? 'none', 'none');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('PASS optional hat/effects preview, save, reload, visibility for another account, static chat avatar, reduced motion, cancel/removal, mobile/desktop, no external asset requests');
} finally { await browser.close(); }
