import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

test('every sql file is applied by migrate, in filename order', () => {
  const files = readdirSync(new URL('../src/db/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .map((name) => name.slice(0, -4))
    .sort();
  const source = readFileSync(new URL('../src/migrate.ts', import.meta.url), 'utf8');
  const listed = [...source.matchAll(/'(\d{3}_[a-z0-9_]+)'/g)].map((match) => match[1]);
  assert.deepEqual(listed, files);
});
