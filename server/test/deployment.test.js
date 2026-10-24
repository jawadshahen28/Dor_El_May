import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { parse } from 'dotenv';
import { loadConfig } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { setupLocalEnvironment } from '../../scripts/setup-env.mjs';

test('production binds to all interfaces and uses the assigned port without changing development defaults', () => {
  const source = { NODE_ENV: 'production', MONGODB_URI: 'mongodb://127.0.0.1:27017/unused_fixture', SESSION_SECRET: 'production-config-fixture-only-at-least-32-characters', APP_ORIGINS: 'https://staging.example', PORT: '10000' };
  const config = loadConfig(source);
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 10000);
  assert.equal(config.cookieName, '__Host-door.sid');
  assert.equal(loadConfig({ SESSION_SECRET: source.SESSION_SECRET }).host, '127.0.0.1');
  assert.equal(loadConfig({ ...source, HOST: '127.0.0.1' }).host, '127.0.0.1');
  for (const APP_ORIGINS of [' ', ', ,']) assert.throws(() => loadConfig({ ...source, APP_ORIGINS }), /at least one/);
});

test('production readiness fails closed without a usable database/session infrastructure', async () => {
  const config = loadConfig({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://127.0.0.1:27017/unused_fixture', SESSION_SECRET: 'production-health-fixture-only-at-least-32-characters', APP_ORIGINS: 'https://staging.example' });
  for (const connected of [false, true]) {
    const app = createApp({ config, isDatabaseAvailable: () => connected });
    const response = await request(app).get('/api/health').expect(503);
    assert.equal(response.body.error.code, 'SERVICE_UNAVAILABLE');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['set-cookie'], undefined);
    assert.doesNotMatch(JSON.stringify(response.body), /mongodb:|password|sessionSecret/);
  }
});

test('environment examples contain names only and the local setup creates fresh secrets without overwriting a file', () => {
  for (const path of ['../../.env.example', '../.env.example', '../../client/.env.example']) {
    const content = readFileSync(new URL(path, import.meta.url), 'utf8');
    for (const line of content.trim().split(/\r?\n/)) assert.match(line, /^[A-Z_][A-Z_\d]*=$/);
  }
  const directory = mkdtempSync(join(tmpdir(), 'door-env-setup-test-'));
  const target = join(directory, '.env');
  try {
    assert.equal(setupLocalEnvironment({ target }), true);
    const first = parse(readFileSync(target));
    assert.equal(first.NODE_ENV, 'development');
    assert.equal(first.MONGODB_URI, '');
    assert.match(first.SESSION_SECRET, /^[a-f\d]{96}$/);
    assert.doesNotThrow(() => loadConfig(first));
    writeFileSync(target, 'MONGODB_URI=unchanged-local-fixture\nSESSION_SECRET=unchanged-fixture\n');
    const existing = readFileSync(target, 'utf8');
    assert.equal(setupLocalEnvironment({ target }), false);
    assert.equal(readFileSync(target, 'utf8'), existing);
  } finally { unlinkSync(target); rmdirSync(directory); }
});
