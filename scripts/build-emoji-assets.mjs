import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';

// Development-only importer. Runtime never contacts GitHub, Unicode, or a CDN.
const REVISION = '1ffb34c752ecf5d402f04cfb4b392c77f57c54bc';
const ROOT = new URL('../', import.meta.url);
const cache = new URL('.cache/chatx-emoji/', ROOT);
const output = new URL('public/assets/emoji/', ROOT);
const rawBase = `https://raw.githubusercontent.com/microsoft/fluentui-emoji/${REVISION}/`;
await mkdir(cache, { recursive: true });
await mkdir(output, { recursive: true });
await mkdir(new URL('raw/', cache), { recursive: true });
async function fetched(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Asset source returned ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
async function source(name, url) {
  const path = new URL(name, cache);
  try { return await readFile(path); } catch {
    const bytes = await fetched(url); await writeFile(path, bytes); return bytes;
  }
}
const tree = JSON.parse((await source('tree.json', `https://api.github.com/repos/microsoft/fluentui-emoji/git/trees/${REVISION}?recursive=1`)).toString());
if (tree.truncated) throw new Error('Incomplete emoji inventory');
const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const folders = new Map(tree.tree.filter((row) => row.path.endsWith('/metadata.json')).map((row) => [normalize(row.path.split('/')[1]), row.path.split('/')[1]]));
const names = new Map();
for (const line of (await source('emoji-test.txt', 'https://unicode.org/Public/emoji/15.0/emoji-test.txt')).toString().split('\n')) {
  const match = line.match(/^([0-9A-F ]+)\s*; fully-qualified\s*#\s*(\S+) E[\d.]+ (.+)$/);
  if (match) names.set(match[2], match[3]);
}
const { EMOJI_GROUPS } = await import('../src/lib/emojiCatalog.ts');
const selected = new Set(EMOJI_GROUPS.flatMap((group) => group.emojis));
const aliases = { '🤗': 'Hugging face', '😵': 'Knocked-out face', '😡': 'Pouting face', '🔺': 'Red triangle', '#️⃣': 'Keycap hashtag', '*️⃣': 'Keycap asterisk' };
const tones = new Map([['🏻', 'Light'], ['🏼', 'Medium-Light'], ['🏽', 'Medium'], ['🏾', 'Medium-Dark'], ['🏿', 'Dark']]);
for (const emoji of names.keys()) {
  const base = emoji.replace(/[\u{1f3fb}-\u{1f3ff}]/gu, '');
  if (base !== emoji && selected.has(base)) selected.add(emoji);
}
const rows = [];
for (const emoji of selected) {
  const base = emoji.replace(/[\u{1f3fb}-\u{1f3ff}]/gu, '');
  const folder = aliases[base] || folders.get(normalize(names.get(base) || ''));
  const tone = [...emoji].find((part) => tones.has(part));
  const prefix = `assets/${folder}/`;
  const candidates = tree.tree.filter((row) => row.path.startsWith(prefix) && row.path.includes('/3D/') && row.path.endsWith('.png'));
  const asset = candidates.find((row) => tone ? row.path.includes(`/${tones.get(tone)}/`) : row.path.includes('/Default/'))
    || (!tone ? candidates.find((row) => row.path.split('/').length === 4) : undefined);
  if (!asset && tone) continue; // Preserve unsupported skin-tone sequences as Unicode at runtime.
  if (!asset) throw new Error(`Missing licensed illustration for ${emoji}`);
  const key = [...emoji].filter((part) => part !== '\ufe0f').map((part) => part.codePointAt(0).toString(16)).join('-');
  rows.push({ emoji, key, path: asset.path });
}
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATX_PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHATX_CHROME_PATH });
let cursor = 0; let processed = 0; let bytes = 0;
try {
  await Promise.all(Array.from({ length: 4 }, async () => {
    const page = await browser.newPage();
    while (cursor < rows.length) {
      const row = rows[cursor++]; const target = new URL(`${row.key}.webp`, output);
      try { const size = (await stat(target)).size; bytes += size; processed++; continue; } catch { /* New asset. */ }
      const url = rawBase + row.path.split('/').map(encodeURIComponent).join('/');
      const png = await source(`raw/${row.key}.png`, url);
      const webp = await page.evaluate(async (base64) => {
        const image = new Image();
        await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = `data:image/png;base64,${base64}`; });
        const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
        canvas.getContext('2d').drawImage(image, 0, 0, 64, 64);
        const data = canvas.toDataURL('image/webp', .86);
        if (!data.startsWith('data:image/webp;')) throw new Error('WebP encoding unavailable');
        return data.split(',')[1];
      }, png.toString('base64'));
      const result = Buffer.from(webp, 'base64'); await writeFile(target, result); bytes += result.length;
      processed++;
      if (processed % 100 === 0) console.log(`Prepared ${processed}/${rows.length} emoji assets`);
    }
    await page.close();
  }));
} finally { await browser.close(); }
const keys = [...new Set(rows.map((row) => row.key))].sort();
await writeFile(new URL('src/lib/emojiAssets.ts', ROOT), `// Generated by scripts/build-emoji-assets.mjs; Microsoft Fluent Emoji, MIT.\nexport const EMOJI_ASSET_KEYS = new Set(${JSON.stringify(keys)});\n`);
await writeFile(new URL('LICENSE.txt', output), await fetched(rawBase + 'LICENSE'));
await writeFile(new URL('NOTICE.txt', output), `Microsoft Fluent Emoji\nCopyright (c) Microsoft Corporation. MIT license; see LICENSE.txt.\nSource: https://github.com/microsoft/fluentui-emoji/tree/${REVISION}\nModified for ChatX: resized to 64px and encoded as WebP.\n${keys.length} assets; ${bytes} bytes.\n`);
console.log(`Prepared ${keys.length} local emoji assets, ${(bytes / 1_000_000).toFixed(2)} MB total`);
