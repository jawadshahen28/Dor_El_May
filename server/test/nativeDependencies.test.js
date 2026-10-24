import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { packages } = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'));
const families = ['rollup', '@tailwindcss/oxide', 'lightningcss', 'esbuild'];
const nativeVariant = /^(?:@rollup\/rollup-|@tailwindcss\/oxide-|lightningcss-|@esbuild\/|@napi-rs\/lzma-)/;

test('lockfile retains every declared build-native optional variant, independent of the developer platform', () => {
  for (const family of families) {
    const owner = packages[`node_modules/${family}`];
    assert.ok(owner?.optionalDependencies, `${family} must declare its native variants`);
    for (const [name, version] of Object.entries(owner.optionalDependencies).filter(([name]) => nativeVariant.test(name))) {
      const entry = packages[`node_modules/${name}`];
      assert.ok(entry, `${name} is missing; regenerate the lockfile without node_modules or an old lockfile`);
      assert.equal(entry.version, version, `${name} must match its parent's published native dependency version`);
      assert.ok(entry.optional, `${name} must remain an optional dependency`);
      assert.match(entry.resolved, /^https:\/\/registry\.npmjs\.org\//);
      assert.match(entry.integrity, /^sha512-/);
    }
  }
});

test('lockfile supports both Render Linux x64 GNU and Windows x64 development', () => {
  const targets = {
    linux: ['@rollup/rollup-linux-x64-gnu', '@tailwindcss/oxide-linux-x64-gnu', 'lightningcss-linux-x64-gnu', '@esbuild/linux-x64'],
    win32: ['@rollup/rollup-win32-x64-msvc', '@tailwindcss/oxide-win32-x64-msvc', 'lightningcss-win32-x64-msvc', '@esbuild/win32-x64'],
  };
  for (const [os, names] of Object.entries(targets)) for (const name of names) {
    const entry = packages[`node_modules/${name}`];
    assert.ok(entry, `${name} must have a resolved lock entry`);
    assert.ok(entry.os.includes(os), `${name} must support ${os}`);
    assert.ok(entry.cpu.includes('x64'), `${name} must support x64`);
    if (os === 'linux' && entry.libc) assert.ok(entry.libc.includes('glibc'), `${name} must support GNU libc`);
  }
});
