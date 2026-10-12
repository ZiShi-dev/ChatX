import { readFile, writeFile, mkdir, stat, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Development-only importer. Runtime never contacts GitHub or a CDN.
// Apple artwork from the user-selected RealityRipple directory; preserve its license.
const REVISION = 'db08071637157a9def981b59beae9a8d64e70778';
const ROOT = new URL('../', import.meta.url);
const cache = new URL('.cache/chatx-emoji-apple/', ROOT);
const output = new URL('public/assets/emoji/', ROOT);
const rawBase = `https://raw.githubusercontent.com/RealityRipple/emoji/${REVISION}/`;
await mkdir(cache, { recursive: true });
await mkdir(output, { recursive: true });
await mkdir(new URL('raw/', cache), { recursive: true });

async function fetched(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Asset source returned ${response.status} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
async function source(name, url) {
  const path = new URL(name, cache);
  try { return await readFile(path); } catch {
    const bytes = await fetched(url);
    await writeFile(path, bytes);
    return bytes;
  }
}

const tree = JSON.parse((await source('tree.json', `https://api.github.com/repos/RealityRipple/emoji/git/trees/${REVISION}?recursive=1`)).toString());
if (tree.truncated) throw new Error('Incomplete emoji inventory');
const available = new Set(tree.tree
  .filter((row) => row.path.startsWith('apple/') && row.path.endsWith('.png'))
  .map((row) => row.path.slice('apple/'.length, -4)));

function appKey(emoji) {
  return [...emoji].filter((part) => part !== '\ufe0f').map((part) => part.codePointAt(0).toString(16)).join('-');
}
const metadata = new Map();
let group = '', subgroup = '';
for (const line of (await source('emoji-test.txt', 'https://unicode.org/Public/emoji/latest/emoji-test.txt')).toString().split('\n')) {
  if (line.startsWith('# group: ')) group = line.slice(9).trim();
  if (line.startsWith('# subgroup: ')) subgroup = line.slice(12).trim();
  const match = line.match(/^([0-9A-F ]+)\s*; fully-qualified\s*#\s*(\S+)/);
  if (match) {
    metadata.set(appKey(match[2]), { emoji: match[2], group, subgroup });
  }
}

const rows = [];
const categories = { faces: [], hearts: [], hands: [], nature: [], food: [], activity: [], travel: [], objects: [], symbols: [], flags: [] };
for (const file of available) {
  const rawEmoji = String.fromCodePoint(...file.split('-').map(part => parseInt(part, 16)));
  const key = appKey(rawEmoji);
  if (key === '1f1ee-1f1f1') continue;
  const info = metadata.get(key);
  const emoji = info?.emoji ?? rawEmoji;
  const category = info?.group === 'Smileys & Emotion' ? (/^(face|cat|monkey)/.test(info.subgroup) ? 'faces' : 'hearts')
    : ({ 'People & Body': 'hands', 'Animals & Nature': 'nature', 'Food & Drink': 'food', 'Activities': 'activity', 'Travel & Places': 'travel', 'Objects': 'objects', 'Symbols': 'symbols', 'Flags': 'flags' }[info?.group ?? ''] ?? 'symbols');
  rows.push({ emoji, file, key });
  categories[category].push(emoji);
}
if (!rows.length) throw new Error('No selected Apple artwork found');

const pending = [];
let next = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < rows.length) {
    const row = rows[next++];
    await source(`raw/${row.file}.png`, `${rawBase}apple/${row.file}.png`);
    pending.push({ png: fileURLToPath(new URL(`raw/${row.file}.png`, cache)), webp: fileURLToPath(new URL(`${row.key}.webp`, output)) });
    if (pending.length % 40 === 0) console.log(`Downloaded ${pending.length}/${rows.length} emoji`);
  }
}));
if (pending.length) {
  const converted = spawnSync(process.env.CHATX_PYTHON || 'python', ['-c', `
from PIL import Image
import json, sys, os, time
jobs = json.load(sys.stdin)
for job in jobs:
    image = Image.open(job["png"]).convert("RGBA")
    # Normalize visible bounds while preserving aspect ratio and a transparent margin.
    bounds = image.getchannel("A").point(lambda value: 255 if value > 12 else 0).getbbox()
    if bounds: image = image.crop(bounds)
    image.thumbnail((58, 58), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (64, 64))
    canvas.alpha_composite(image, ((64-image.width)//2, (64-image.height)//2))
    image = canvas
    temporary = job["webp"] + ".apple-tmp"
    image.save(temporary, "WEBP", quality=86, method=6)
    for attempt in range(10):
        try:
            os.replace(temporary, job["webp"])
            break
        except OSError:
            if attempt == 9: raise
            time.sleep(0.1)
print(len(jobs))
`], { input: JSON.stringify(pending), encoding: 'utf8' });
  if (converted.status !== 0) throw new Error(converted.stderr || 'WebP conversion failed');
}

const keys = [...new Set(rows.map((row) => row.key))].sort();
const keep = new Set(keys.map((key) => `${key}.webp`));
for (const name of await readdir(output)) {
  if (name.endsWith('.webp') && !keep.has(name)) await rm(new URL(name, output));
}
let total = 0;
for (const key of keys) total += (await stat(new URL(`${key}.webp`, output))).size;

await writeFile(new URL('src/lib/emojiAssets.ts', ROOT), `// Generated by scripts/import-apple-emoji.mjs; Apple artwork; see public/assets/emoji/LICENSE.txt.\nexport const EMOJI_ASSET_KEYS = new Set(${JSON.stringify(keys)});\n`);
await writeFile(new URL('src/lib/appleEmojiCatalog.ts', ROOT), `// Generated from every eligible image in the Apple source directory.\nexport const APPLE_EMOJI_CATEGORIES = ${JSON.stringify(categories)};\n`);
await writeFile(new URL('LICENSE.txt', output), await fetched(rawBase + 'LICENSE-APPLE'));
await writeFile(new URL('NOTICE.txt', output), `Apple emoji artwork\nCopyright (C) Apple Inc. All rights reserved.\nLicense supplied by the source repository: see LICENSE.txt.\nSource: https://github.com/RealityRipple/emoji/tree/${REVISION}/apple\nSelection: complete Apple directory except 1f1ee-1f1f1 (Israel flag), as requested.\nModified for ChatX: visible bounds normalized into a 64px canvas and encoded as WebP.\n${keys.length} assets; ${total} bytes.\n`);
console.log(`Prepared ${keys.length} local Apple emoji assets, ${(total / 1_000_000).toFixed(2)} MB total`);
