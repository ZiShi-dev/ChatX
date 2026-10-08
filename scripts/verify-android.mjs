import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Run only against a disposable emulator with a synthetic account.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATX_PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.connectOverCDP(process.env.CHATX_ANDROID_CDP || 'http://127.0.0.1:4191');
try {
  const page = browser.contexts()[0].pages()[0];
  const user = { id: '11111111-1111-4111-8111-111111111111', username: 'androidtest', displayName: 'Android test', role: 'member', bio: '', status: 'offline', color: '#4d7ea8' };
  const room = { id: '00000000-0000-4000-8000-000000000001', type: 'global', name: 'ChatX', participantIds: [user.id], unreadCount: 0, createdAt: new Date().toISOString() };
  const messages = Array.from({ length: 300 }, (_, index) => ({ id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, '0')}`, conversationId: room.id, senderId: user.id, type: 'text', text: `Native cached ${index + 1}`, status: 'sent', createdAt: new Date(Date.now() - 60_000 + index).toISOString() }));
  await page.waitForSelector('ion-content.hydrated');
  await page.evaluate(({ user, room, messages }) => {
    localStorage.setItem('chatx.auth', JSON.stringify({ activated: true, currentUser: user, accounts: [user] }));
    localStorage.setItem(`chatx.chat.v1.${user.id}`, JSON.stringify({ conversations: [room], users: [user], messages }));
  }, { user, room, messages });
  await page.goto(`https://localhost/chat/${room.id}`);
  await page.getByText('Native cached 300', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.locator('textarea').fill('Native offline pending');
  await page.locator('textarea').press('Enter');
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem(`chatx.chat.v1.${id}`) || '{}').messages?.some((m) => m.text === 'Native offline pending' && m.status === 'pending'), user.id);
  await page.reload();
  await page.getByText('Native offline pending', { exact: true }).waitFor();
  console.log('PASS Android WebView hydration, 300 cached messages, bounded layout and durable pending message after reload');
  console.log('Network status reported by WebView:', await page.evaluate(() => navigator.onLine));
} finally { await browser.close(); }
