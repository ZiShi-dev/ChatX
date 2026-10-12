import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { mediaBubbleWidth } from '../src/lib/mediaBubbleLayout.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATX_PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHATX_CHROME_PATH });
try {
  for (const viewport of [{ width: 360, height: 800 }, { width: 1280, height: 900 }]) {
    const page = await browser.newPage({ viewport });
    const cards = [[600, 900], [1000, 500], [800, 800]].map(([width, height], i) => {
      const picture = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#54848a"/><path d="M0 ${height}L${width / 2} ${height / 3}L${width} ${height}Z" fill="#b0cabc"/><circle cx="${width * .7}" cy="${height * .2}" r="${width * .07}" fill="#ecdaaa"/></svg>`;
      return `<div class="bubble-stack is-media ${i === 1 ? 'theirs' : 'mine'}" style="--media-inline-size:${mediaBubbleWidth(width, height) + 6}px"><div class="swipe-shift"><div class="bubble-row"><div class="bubble has-media"><div class="media-card image"><button class="media-open"><img class="media-preview" src="data:image/svg+xml,${encodeURIComponent(picture)}" style="aspect-ratio:${width}/${height}" /></button></div><span class="bubble-time">15:04 ✓✓</span></div></div></div></div>`;
    }).join('');
    await page.setContent(`<style>${readFileSync('src/theme/chat.css', 'utf8')}${readFileSync('src/components/chat/MessageMedia.css', 'utf8')}body{margin:0;background:#0e1714;color:#fff;font:14px Arial;--chatx-frame:#29473d;--chatx-soft:#174b3b;--chatx-on-soft:#fff;--chatx-bg:#0e1714}.chat-thread{box-sizing:border-box;min-height:100vh}.bubble-time{direction:ltr}</style><main class="chat-thread">${cards}</main>`);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    const dimensions = await page.locator('.bubble-stack').evaluateAll(stacks => stacks.map(stack => {
      const photo = stack.querySelector('img'), time = stack.querySelector('.bubble-time');
      const image = photo.getBoundingClientRect(), stamp = time.getBoundingClientRect(), frame = stack.querySelector('.bubble').getBoundingClientRect();
      return { width: frame.width, gap: frame.width - image.width, ratio: image.width / image.height, natural: photo.naturalWidth / photo.naturalHeight, timeInside: stamp.bottom <= image.bottom && stamp.top >= image.top };
    }));
    for (const item of dimensions) {
      assert.ok(item.width <= 279, 'Preview must stay compact even on desktop');
      assert.ok(item.gap <= 9, 'Frame must hug the photo');
      assert.ok(Math.abs(item.ratio - item.natural) < .01, 'Preserve image proportions');
      assert.ok(item.timeInside, 'Time must stay inside the photo');
    }
    if (viewport.width === 360) await page.screenshot({ path: 'docs/media-bubbles-mobile.png', fullPage: true });
    await page.close();
  }
  console.log('PASS portrait, landscape and square previews on phone and desktop; fitted frames and visible time');
} finally { await browser.close(); }
