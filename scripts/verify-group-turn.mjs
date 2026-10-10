import { prepareTestIdentity } from './browser-test-keys.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATX_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.CHATX_TEST_ORIGIN || 'http://127.0.0.1:4184';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHATX_CHROME_PATH });
const alice = { id: '11111111-1111-4111-8111-111111111111', username: 'alice', displayName: 'Alice', role: 'member', bio: '', status: 'online', color: '#4d7ea8' };
const bob = { ...alice, id: '22222222-2222-4222-8222-222222222222', username: 'bob', displayName: 'Bob' };
const id = '00000000-0000-4000-8000-000000000001';
let mode = 'stale';
try {
  const context = await browser.newContext({ viewport: { width: 360, height: 640 }, permissions: ['notifications'] });
  await context.addInitScript((user) => {
    localStorage.setItem('chatx.auth', JSON.stringify({ activated: true, currentUser: user, accounts: [user] }));
    // Reproduce a phone whose wall clock is weeks ahead of the server.
    Date.now = () => Date.parse('2026-11-01T12:00:00Z');
  }, alice);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/turn') && mode === 'offline') return route.abort();
    const room = { id, type: 'global', name: 'ChatX', participantIds: [alice.id, bob.id], unreadCount: 0,
      createdAt: '2026-09-01T12:00:00Z', turnUserId: bob.id,
      turnOpensAt: '2026-09-20T12:00:00Z' };
    let body = { ok: true };
    if (path === '/api/home') body = { conversations: [room], users: [alice, bob] };
    if (path.endsWith('/turn')) body = { roomId: id, participantIds: [alice.id, bob.id], holder: bob, turnUserId: bob.id,
      turnOpensAt: mode === 'fresh' ? '2026-10-08T12:00:00Z' : '2026-09-20T12:00:00Z',
      turnExpiresAt: mode === 'fresh' ? '2026-10-15T12:00:00Z' : '2026-09-27T12:00:00Z', serverTime: '2026-10-09T12:00:00Z' };
    if (path === '/api/profile') body = { user: alice };
    if (path === '/api/notifications') body = { notifications: [], hasMore: false };
    if (path.endsWith('/messages')) body = { messages: [], readers: [], hasMore: false };
    await route.fulfill({ json: body, headers: { date: 'Fri, 09 Oct 2026 12:00:00 GMT' } });
  });
  await page.goto(`${base}/group/${id}/`);
  await prepareTestIdentity(page, alice.id);
  await page.getByText('انتهى الدور — تعذر تحميل بيانات الدور التالي', { exact: true }).waitFor();
  assert.equal(await page.getByText('انتهى الدور — جارٍ تحديث الدور التالي', { exact: true }).count(), 0);
  mode = 'offline';
  await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await page.getByText('انتهى الدور — تعذر الاتصال لتحديث الدور التالي', { exact: true }).waitFor();
  mode = 'fresh';
  await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await page.locator('.group-turn').filter({ hasText: 'دور Bob' }).waitFor();
  assert.equal(await page.locator('.group-turn').textContent().then((text) => text.includes('انتهى')), false);
  assert.equal(await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS stale response stops progress, offline retry reports failure, recovered holder appears despite incorrect phone clock and trailing slash');
  await context.close();
} finally { await browser.close(); }
