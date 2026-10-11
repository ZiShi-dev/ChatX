import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { zipDirectory } from '../../scripts/zipDirectory.mjs';

it('packs interface files at the archive root', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chatx-zip-'));
  try {
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<html>chatx</html>');
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
    writeFileSync(join(dir, 'assets', 'app.js.map'), 'secret-map');
    const zip = zipDirectory(dir);
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
    const names = [];
    let offset = 0;
    while (offset + 30 < zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
      const nameLength = zip.readUInt16LE(offset + 26);
      const compressed = zip.readUInt32LE(offset + 18);
      const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString();
      const body = inflateRawSync(zip.subarray(offset + 30 + nameLength, offset + 30 + nameLength + compressed));
      names.push(`${name}:${body.toString()}`);
      offset += 30 + nameLength + compressed;
    }
    assert.deepEqual(names.sort(), ['assets/app.js:console.log(1)', 'index.html:<html>chatx</html>']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
