import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Uses an existing Playwright installation; does not download a browser or add dependencies.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATX_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.CHATX_TEST_ORIGIN || 'http://127.0.0.1:4174';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHATX_CHROME_PATH });
const user = { id: '11111111-1111-4111-8111-111111111111', username: 'alice', displayName: 'Alice', role: 'member', bio: '', status: 'online', color: '#4d7ea8' };
const roomId = '00000000-0000-4000-8000-000000000001';
const room = { id: roomId, type: 'global', name: 'ChatX', participantIds: [user.id], unreadCount: 0, createdAt: '2026-10-09T12:00:00Z' };
const messages = Array.from({ length: 1000 }, (_, index) => ({ id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, '0')}`, conversationId: roomId, senderId: user.id, text: `Message ${index + 1}`, type: index === 999 ? 'image' : 'text', fileSize: index === 999 ? 3 : undefined, createdAt: new Date(Date.now() - 60_000).toISOString(), deleted: false }));
try {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, permissions: ['notifications'] });
  const page = await context.newPage();
  const errors = []; const uploadedImages = []; let imageRequests = 0; let rejectEdits = true;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    let body = { ok: true };
    if (url.pathname.endsWith('/image')) imageRequests += 1;
    if (url.pathname === '/api/home') body = { conversations: [room], users: [user] };
    if (url.pathname === '/api/profile') body = { user };
    if (url.pathname.endsWith('/messages') && request.method() === 'GET') {
      const before = url.searchParams.get('beforeId'); const around = url.searchParams.get('aroundId');
      const index = before || around ? messages.findIndex((message) => message.id === (before || around)) : messages.length;
      const end = around ? index + 1 : index;
      body = { messages: messages.slice(Math.max(0, end - 30), end), readers: [], hasMore: end > 30 };
    }
    if (url.pathname.endsWith('/messages') && request.method() === 'POST') {
      const input = request.postDataJSON();
      if (input.image) uploadedImages.push(input.image);
      const message = { id: input.id, conversationId: roomId, senderId: user.id, type: input.image ? 'image' : 'text', text: input.text || '', fileSize: input.image ? Buffer.from(input.image.split(',')[1], 'base64').length : undefined, createdAt: new Date().toISOString(), deleted: false };
      if (!messages.some((item) => item.id === input.id)) messages.push(message);
      body = { message };
    }
    if (/\/messages\/[^/]+$/.test(url.pathname) && request.method() === 'PATCH') {
      if (rejectEdits) return route.fulfill({ status: 503, json: { error: 'unavailable' } });
      const message = messages.find((item) => item.id === url.pathname.split('/').at(-1));
      message.text = request.postDataJSON().text; body = { ok: true };
    }
    if (url.pathname === '/api/notifications') body = { notifications: [], unreadCount: 0 };
    if (url.pathname === '/api/saved') body = { saved: [], hasMore: false };
    if (url.pathname === '/api/presence') body = { users: [] };
    if (url.pathname.endsWith('/read')) body = { ok: true, unreadCount: 0, unreadNotifications: 0 };
    await route.fulfill({ json: body });
  });
  await page.goto(base);
  await page.waitForSelector('ion-content.hydrated');
  assert.ok(await page.getByText('ChatX', { exact: true }).count());
  console.log('PASS production activation and Ionic hydration');
  await page.evaluate((user) => {
    localStorage.setItem('chatx.auth', JSON.stringify({ activated: true, currentUser: user, accounts: [user] }));
    localStorage.setItem('chatx.settings', JSON.stringify({ dataSaver: true, autoDownloadImages: true }));
  }, user);
  await page.goto(`${base}/chat/${roomId}`);
  await page.getByText('Message 971', { exact: true }).waitFor();
  for (let index = 0; index < 10; index++) {
    await page.getByText('تحميل رسائل أقدم', { exact: true }).click();
    await page.getByText(`Message ${1000 - (index + 2) * 30 + 1}`, { exact: true }).waitFor();
    assert.ok(await page.locator('[id^="msg-"]').count() <= 120);
  }
  assert.ok(await page.locator('[id^="msg-"]').count() <= 120);
  assert.equal(imageRequests, 0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false);
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem(`chatx.chat.v1.${id}`) || '{}').messages?.length <= 300, user.id);
  console.log('PASS 1,000-message history, rolling pages, bounded DOM/cache, data saver');
  for (const viewport of [{ width: 360, height: 640 }, { width: 640, height: 360 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  console.log('PASS 360px, landscape and tablet layouts without horizontal overflow');
  await page.goto(`${base}/chat/${roomId}?at=${messages[9].id}`);
  await page.getByText('Message 10', { exact: true }).waitFor();
  console.log('PASS deep link to an old message outside the recent cache');
  await page.goto(`${base}/chat/${roomId}`);
  await page.getByText('Message 971', { exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'تعديل', exact: true }).click();
  await page.locator('textarea').fill('Edit retained after failure');
  await page.getByRole('button', { name: 'حفظ', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'تعذر تعديل الرسالة' }).waitFor();
  assert.equal(await page.locator('textarea').inputValue(), 'Edit retained after failure');
  assert.ok(await page.getByText('Message 971', { exact: true }).count());
  rejectEdits = false;
  await page.getByRole('button', { name: 'حفظ', exact: true }).click();
  await page.locator(`#msg-${messages[970].id}`).getByText('Edit retained after failure', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('textarea')?.value === '');
  console.log('PASS failed edit preserves draft; successful retry applies server edit');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
    canvas.getContext('2d').fillRect(0, 0, 32, 32);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('input[type=file]').first().setInputFiles(Array.from({ length: 11 }, (_, index) => ({ name: `image-${index}.png`, mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })));
  await page.waitForFunction(() => document.querySelectorAll('.attach-thumb img').length === 10);
  assert.ok(await page.locator('.attach-thumb img').evaluateAll((images) => images.every((image) => image.getAttribute('src')?.startsWith('data:image/jpeg') && image.getAttribute('src').length < 81_000)));
  for (let index = 0; index < 10; index += 1) await page.locator('.attach-remove').first().click();
  assert.equal(await page.locator('.attach-remove').count(), 0);
  console.log('PASS attachment selection caps at ten; previews use compressed thumbnails; removal works');
  const detailedPng = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const context = canvas.getContext('2d'); const pixels = context.createImageData(640, 480);
    let seed = 17;
    for (let index = 0; index < pixels.data.length; index += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels.data[index] = seed & 255; pixels.data[index + 1] = (seed >>> 8) & 255; pixels.data[index + 2] = (seed >>> 16) & 255; pixels.data[index + 3] = 255;
    }
    context.putImageData(pixels, 0, 0); return canvas.toDataURL('image/png').split(',')[1];
  });
  const detailedFile = { name: 'detailed.png', mimeType: 'image/png', buffer: Buffer.from(detailedPng, 'base64') };
  for (const [label, limit] of [['توفير البيانات', 20_000], ['عالية', 60_000]]) {
    const count = uploadedImages.length;
    await page.locator('input[type=file]').first().setInputFiles(detailedFile);
    await page.locator('.attach-thumb img').waitFor();
    await page.getByRole('radio', { name: label, exact: true }).click();
    const uploaded = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/messages') && !!response.request().postDataJSON()?.image);
    await page.locator('textarea').press('Enter');
    await uploaded;
    assert.equal(uploadedImages.length, count + 1);
    assert.ok(Buffer.from(uploadedImages.at(-1).split(',')[1], 'base64').length <= limit);
    await page.waitForFunction((id) => JSON.parse(localStorage.getItem(`chatx.chat.v1.${id}`) || '{}').messages?.every((message) => message.status === 'sent'), user.id);
  }
  assert.ok(Buffer.from(uploadedImages.at(-1).split(',')[1], 'base64').length > 20_000);
  console.log('PASS detailed image upload caps at 20 kB in saver mode; high quality remains available up to 60 kB');
  await page.getByRole('button', { name: 'إيموجي', exact: true }).click();
  await page.getByRole('option', { name: '😀', exact: true }).locator('img').waitFor();
  await page.waitForFunction(() => {
    const grid = document.querySelector('.emoji-grid')?.getBoundingClientRect();
    if (!grid) return false;
    const visible = [...document.querySelectorAll('.emoji-grid .chat-emoji img')].filter((image) => {
      const box = image.getBoundingClientRect(); return box.bottom > grid.top && box.top < grid.bottom;
    });
    return visible.length > 0 && visible.every((image) => image.complete && image.naturalWidth === 64);
  });
  await page.locator('.emoji-panel').screenshot({ path: 'docs/emoji-preview.png' });
  await page.getByRole('option', { name: '😀', exact: true }).click();
  assert.equal(await page.locator('textarea').inputValue(), '😀');
  const emojiMessage = 'مرحبا 😀 ❤️‍🔥 👍🏽 👨‍👩‍👧‍👦';
  await page.locator('textarea').fill(emojiMessage);
  const emojiPosted = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/messages') && response.request().postDataJSON()?.text === emojiMessage);
  await page.locator('textarea').press('Enter');
  await emojiPosted;
  const emojiId = messages.at(-1).id;
  const emojiBubble = page.locator(`#msg-${emojiId} .bubble-text`);
  assert.equal(await emojiBubble.textContent(), emojiMessage);
  assert.equal(await emojiBubble.locator('.chat-emoji img').count(), 3);
  assert.ok(await emojiBubble.locator('.chat-emoji img').evaluateAll((images) => images.every((image) => image.getAttribute('src').startsWith('/assets/emoji/'))));
  await emojiBubble.scrollIntoViewIfNeeded();
  await page.waitForFunction((id) => [...document.querySelectorAll(`#msg-${id} .chat-emoji img`)].every((image) => image.complete && image.naturalWidth === 64), emojiId);
  console.log('PASS local 3D emoji picker, Unicode send, toned/ZWJ rendering and intact unsupported sequences');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    window.dispatchEvent(new Event('offline'));
  });
  await page.locator('textarea').fill('Offline durable message');
  await page.locator('textarea').press('Enter');
  await page.waitForFunction((id) => {
    const snapshot = JSON.parse(localStorage.getItem(`chatx.chat.v1.${id}`) || '{}');
    return snapshot.messages?.some((message) => message.text === 'Offline durable message' && message.status === 'pending');
  }, user.id);
  await page.reload();
  await page.getByText('Offline durable message', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS offline outbox persists across reload; no browser exceptions');
  const bob = { ...user, id: '22222222-2222-4222-8222-222222222222', username: 'bob', displayName: 'Bob' };
  await context.addInitScript((id) => {
    if (JSON.parse(localStorage.getItem('chatx.auth') || '{}').currentUser?.id === id) {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    }
  }, bob.id);
  await page.evaluate((user) => localStorage.setItem('chatx.auth', JSON.stringify({ activated: true, currentUser: user, accounts: [user] })), bob);
  await page.goto(`${base}/home`);
  await page.waitForSelector('ion-content.hydrated');
  assert.equal(await page.getByText('Offline durable message', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Edit retained after failure', { exact: true }).count(), 0);
  assert.ok(await page.evaluate((id) => localStorage.getItem(`chatx.chat.v1.${id}`)?.includes('Offline durable message'), user.id));
  await page.evaluate((user) => localStorage.setItem('chatx.auth', JSON.stringify({ activated: true, currentUser: user, accounts: [user] })), user);
  await page.goto(`${base}/chat/${roomId}`);
  await page.getByText('Offline durable message', { exact: true }).waitFor();
  console.log('PASS offline account switch isolates caches and restores the original account');
  await context.close();
} finally { await browser.close(); }
