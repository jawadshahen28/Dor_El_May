import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { hashPassword, verifyPassword } from '../src/utils/password.js';

const config = loadConfig({ SESSION_SECRET: 'test-only-random-secret-32-characters-long' });
const app = createApp({ config, isDatabaseAvailable: () => false });

test('server starts without a database, reports its state, and fails auth closed', async () => {
  const health = await request(app).get('/api/health').expect(200);
  assert.equal(health.body.data.database, 'unavailable');
  for (const path of ['/api/auth/me', '/api/zones', '/api/admin/dashboard', '/api/admin/me', '/api/admin/water', '/api/admin/water-rounds']) {
    const response = await request(app).get(path).expect(503);
    assert.equal(response.body.error.code, 'SERVICE_UNAVAILABLE');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['set-cookie'], undefined);
  }
  await request(app).post('/api/auth/login').send({ phone: '0599123456', password: 'Secret99' }).expect(503);
});

test('passwords use randomized Argon2id hashes and reject wrong passwords', async () => {
  const [a, b] = await Promise.all([hashPassword('Passphrase9!'), hashPassword('Passphrase9!')]);
  assert.match(a, /^\$argon2id\$/);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword(a, 'Passphrase9!'), true);
  assert.equal(await verifyPassword(a, 'WrongPass9'), false);
});

test('production refuses missing secrets and non-HTTPS origins', () => {
  assert.throws(() => loadConfig({}), /SESSION_SECRET/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', SESSION_SECRET: config.sessionSecret }), /HTTPS|MONGODB_URI/);
});
