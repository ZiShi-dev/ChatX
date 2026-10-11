import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Exercise startup control flow without changing real ownership or requiring Docker Engine.
const bash = process.env.CHATX_BASH_PATH || (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash');
const temp = mkdtempSync(join(tmpdir(), 'chatx-startup-'));
const media = join(temp, 'media');
const entry = join(temp, 'entry.sh');
const harness = join(temp, 'harness.sh');
const unix = path => path.replaceAll('\\', '/');
mkdirSync(media);
try {
  writeFileSync(entry, readFileSync(new URL('../server/docker-entrypoint.sh', import.meta.url), 'utf8').replaceAll('/media', unix(media)));
  writeFileSync(harness, `#!/bin/sh
id() { printf '%s\\n' "$CASE_UID"; }
mkdir() { printf 'mkdir|%s\\n' "$*"; }
chown() { printf 'chown|%s\\n' "$*"; [ "$FAIL_CHOWN" != 1 ]; }
exec() { printf 'exec|'; printf '<%s>' "$@"; printf '\\n'; exit 0; }
. "$1" node src/main.ts
`);
  const run = extra => execFileSync(bash, [unix(harness), unix(entry)], { encoding: 'utf8', env: { ...process.env, CASE_UID: '0', FAIL_CHOWN: '0', ...extra } });
  const root = run({});
  assert.ok(root.includes(`chown|node:node ${unix(media)}\n`));
  assert.ok(root.includes(`chown|-Rh node:node ${unix(media)}/images ${unix(media)}/files\n`));
  assert.ok(!root.includes(`chown|-R node:node ${unix(media)}\n`));
  assert.ok(root.includes('exec|<su-exec><node><node><src/main.ts>'));
  const nonRoot = run({ CASE_UID: '1000' });
  assert.ok(!nonRoot.includes('chown|') && !nonRoot.includes('mkdir|'));
  assert.ok(nonRoot.includes('exec|<node><src/main.ts>'));
  assert.throws(() => run({ FAIL_CHOWN: '1' }), 'Permission failures must prevent an unusable API from starting');
  const compose = JSON.parse(execFileSync('docker', ['compose', 'config', '--format', 'json'], { encoding: 'utf8' }));
  assert.deepEqual(compose.services.api.cap_drop, ['ALL']);
  assert.deepEqual(compose.services.api.cap_add.toSorted(), ['CHOWN', 'SETGID', 'SETUID']);
  assert.equal(compose.services.api.read_only, true);
  assert.ok(compose.services.api.security_opt.includes('no-new-privileges:true'));
  console.log('PASS scoped media ownership, root-to-node startup, non-root startup, failure handling and minimal Compose capabilities');
} finally {
  for (const file of [entry, harness]) unlinkSync(file);
  rmdirSync(media);
  rmdirSync(temp);
}
