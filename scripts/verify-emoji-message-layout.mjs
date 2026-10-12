import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const ts = require('typescript'), React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const mod = { exports: {} };
const emojiModule = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(readFileSync('src/lib/emoji.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(() => require('../src/lib/emojiAssets.ts'), emojiModule, emojiModule.exports);
const source = ts.transpileModule(readFileSync('src/components/common/EmojiText.tsx', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
new Function('require', 'module', 'exports', source)(name => name === '../../lib/emoji' ? emojiModule.exports : name.endsWith('.css') ? {} : require(name), mod, mod.exports);
const { chromium } = require(process.env.CHATX_PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHATX_CHROME_PATH });
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 540 } });
  await page.route('https://chatx.test/assets/emoji/**', route => route.fulfill({ contentType: 'image/webp', body: readFileSync('public' + new URL(route.request().url()).pathname) }));
  const rows = [['😀', true], ['🐱', true], ['👍', true], ['😀 😂 🐱', false]].map(([text, single], i) => `<div class="bubble-stack ${i === 1 ? 'theirs' : 'mine'}"><div class="bubble ${single ? 'is-single-emoji' : ''}"><p class="bubble-text is-emoji-${single ? 1 : 3}">${renderToStaticMarkup(React.createElement(mod.exports.default, { text }))}</p><span class="bubble-time">12:34 <span class="status-mark seen">✓✓</span></span></div></div>`).join('');
  // Load shared chat styles last to verify the frameless style survives sender rules.
  await page.setContent(`<base href="https://chatx.test/"><style>${readFileSync('src/components/common/EmojiText.css', 'utf8')}${readFileSync('src/theme/chat.css', 'utf8')}body{margin:0;background:#0e1714;color:#fff;font:16px Arial;--chatx-bg:#0e1714;--chatx-soft:#174b3b;--chatx-mine:#174b3b;--chatx-on-mine:#fff;--chatx-on-soft:#fff;--chatx-muted-mine:#bbd1c6;--chatx-muted-surface:#bbd1c6;--chatx-raised:#1a2923;--chatx-muted:#bbd1c6;--chatx-text:#fff;--chatx-read:#53bdeb;--chatx-frame:#29473d}.chat-thread{box-sizing:border-box;min-height:100vh;gap:18px}</style><main class="chat-thread">${rows}</main>`);
  await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  const singles = await page.locator('.is-single-emoji').evaluateAll(items => items.map(item => ({ background: getComputedStyle(item).backgroundColor, border: getComputedStyle(item).borderTopWidth, emoji: item.querySelector('.chat-emoji').getBoundingClientRect().width, footer: item.querySelector('.bubble-time').getBoundingClientRect().top, glyphBottom: item.querySelector('.chat-emoji').getBoundingClientRect().bottom })));
  for (const item of singles) { assert.equal(item.background, 'rgba(0, 0, 0, 0)'); assert.equal(item.border, '0px'); assert.equal(item.emoji, 56); assert.ok(item.footer >= item.glyphBottom); }
  const multiple = await page.locator('.bubble:not(.is-single-emoji)').evaluate(item => ({ background: getComputedStyle(item).backgroundColor, sizes: [...item.querySelectorAll('.chat-emoji')].map(glyph => glyph.getBoundingClientRect().width) }));
  assert.notEqual(multiple.background, 'rgba(0, 0, 0, 0)'); assert.deepEqual(multiple.sizes, [36, 36, 36]);
  await page.screenshot({ path: 'docs/emoji-message-layout-mobile.png' });
  console.log('PASS single emojis have no bubble, uniform 56px glyphs and a footer; multiple emojis have a bubble and uniform 36px glyphs');
} finally { await browser.close(); }
