import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config/env.js';

const source = { SESSION_SECRET: 'origin-tests-only-secret-at-least-32-characters' };
const origins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://192.168.1.6:5173'];

test('development origins come only from the explicit environment allowlist', () => {
  const config = loadConfig({ ...source, NODE_ENV: 'development', APP_ORIGINS: ` ${origins.join(', ')} ` });
  assert.deepEqual(config.origins, origins);
  assert.equal(config.production, false);
  assert.equal(config.cookieName, 'door.sid');
  const changedIp = loadConfig({ ...source, APP_ORIGINS: 'http://192.168.1.20:5173' });
  assert.deepEqual(changedIp.origins, ['http://192.168.1.20:5173']);
  assert.ok(!changedIp.origins.includes(origins[2]));
});

test('wildcard origins, credentials, paths, and unsupported schemes are refused', () => {
  for (const origin of ['*', 'http://192.168.1.*:5173', 'http://192.168.1.6:5173/login', 'http://user:password@192.168.1.6:5173', 'file:///local']) {
    assert.throws(() => loadConfig({ ...source, APP_ORIGINS: origin }));
  }
});

test('production still requires HTTPS and does not inherit the development LAN origin', () => {
  const production = { ...source, NODE_ENV: 'production', MONGODB_URI: 'mongodb://127.0.0.1:27017/unused_fixture' };
  assert.throws(() => loadConfig({ ...production, APP_ORIGINS: origins.join(',') }), /HTTPS/);
  const config = loadConfig({ ...production, APP_ORIGINS: 'https://door.example' });
  assert.deepEqual(config.origins, ['https://door.example']);
  assert.equal(config.production, true);
  assert.equal(config.cookieName, '__Host-door.sid');
});
