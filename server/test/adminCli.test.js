import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { question } from '../src/create-admin.js';

test('interactive admin password input returns the value without echoing any characters', async () => {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => input;
  let shown = '';
  const output = new Writable({ write(chunk, _encoding, done) { shown += chunk.toString(); done(); } });
  const secret = 'DisposableHiddenFixture9!';
  const pending = question('Password: ', true, { input, output });
  input.write(`${secret}\r`);
  assert.equal(await pending, secret);
  assert.equal(shown, 'Password: \n');
  input.destroy(); output.end();
});

test('admin CLI refuses piped input and command-line passwords without connecting or printing secrets', () => {
  const script = fileURLToPath(new URL('../src/create-admin.js', import.meta.url));
  const secret = 'NeverPrintCliFixture9!';
  for (const args of [[], ['--password', secret]]) {
    const result = spawnSync(process.execPath, [script, ...args], {
      input: secret, encoding: 'utf8', timeout: 10000,
      env: { ...process.env, MONGODB_URI: `mongodb://user:${secret}@127.0.0.1:1/unreachable` },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /interactive local terminal/);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(secret));
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /MongoDB connected/);
  }
});
