import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import express from 'express';
import mongoose from 'mongoose';
import MongoStore from 'connect-mongo';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createServer } from 'vite';
import viteConfig from '../../../client/vite.config.js';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import { connectDatabase, databaseAvailable } from '../../src/config/database.js';
import { createRateLimits } from '../../src/middleware/rateLimits.js';
import { hashPassword } from '../../src/utils/password.js';
import { User } from '../../src/models/User.js';
import { Zone } from '../../src/models/Zone.js';

// Isolated real MongoDB and Vite/Express servers on loopback with random ports.
// Never connect to Atlas or use any developer credentials.
const phoneOrigin = 'http://192.168.1.6:5173';
const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', phoneOrigin];
const profile = { phone: '0597123456', password: 'LanFixture9!' };
let mongo, backend, vite;
const seenHeaders = [];

before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { downloadDir: fileURLToPath(new URL('../../../.cache/mongodb', import.meta.url)) } });
  const connection = await connectDatabase(mongo.getUri('isolated_lan_auth_test'));
  await Promise.all([User.init(), Zone.init()]);
  const zone = await Zone.create({ name: 'حارة اختبار الشبكة' });
  await User.create({ fullName: 'مستخدم الشبكة', phone: profile.phone, passwordHash: await hashPassword(profile.password), zoneId: zone._id });
  const config = loadConfig({ NODE_ENV: 'development', SESSION_SECRET: 'lan-fixture-only-secret-at-least-32-characters', APP_ORIGINS: allowedOrigins.join(',') });
  const store = MongoStore.create({ client: connection.getClient(), collectionName: 'sessions' });
  store.on('error', () => {});
  const recorder = express();
  recorder.use((req, _res, next) => {
    seenHeaders.push({ origin: req.get('Origin'), host: req.get('Host'), hasCookie: Boolean(req.get('Cookie')), hasCsrf: Boolean(req.get('X-CSRF-Token')) });
    next();
  });
  recorder.use(createApp({ config, store, limits: await createRateLimits(connection), isDatabaseAvailable: databaseAvailable }));
  await new Promise((resolve, reject) => { backend = recorder.listen(0, '127.0.0.1', resolve); backend.once('error', reject); });

  // Use the actual application proxy options. Override only the target/ports for isolation.
  const frontend = viteConfig({ mode: 'development' });
  const apiProxy = frontend.server.proxy['/api'];
  assert.equal(apiProxy.changeOrigin, false);
  vite = await createServer({
    ...frontend,
    configFile: false,
    root: fileURLToPath(new URL('../../../client', import.meta.url)),
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: {
      ...frontend.server, host: '127.0.0.1', port: 0, hmr: false,
      proxy: { '/api': { ...apiProxy, target: `http://127.0.0.1:${backend.address().port}` } },
    },
  });
  await vite.listen();
});

after(async () => {
  await vite?.close();
  if (backend) await new Promise((resolve) => { backend.close(resolve); backend.closeAllConnections(); });
  await mongoose.disconnect();
  await mongo?.stop();
});

function post(agent, origin, csrf, { site = 'same-origin', referer } = {}) {
  let req = agent.post('/api/auth/login').set('Host', '192.168.1.6:5173').set('Sec-Fetch-Site', site);
  if (origin !== undefined) req = req.set('Origin', origin);
  if (referer) req = req.set('Referer', referer);
  if (csrf !== undefined) req = req.set('X-CSRF-Token', csrf);
  return req.send(profile);
}

test('LAN and loopback login work through Vite with persistent HTTP cookies and logout', async () => {
  for (const origin of allowedOrigins) {
    const agent = request.agent(vite.httpServer);
    const me = await agent.get('/api/auth/me').set('Host', '192.168.1.6:5173').expect(200);
    const initialCookie = me.headers['set-cookie'][0];
    assert.match(initialCookie, /HttpOnly/);
    assert.match(initialCookie, /SameSite=Lax/i);
    assert.doesNotMatch(initialCookie, /; Secure/i);
    assert.doesNotMatch(initialCookie, /; Domain=/i);
    const login = await post(agent, origin, me.body.data.csrfToken).expect(200);
    assert.equal(login.body.data.user.fullName, 'مستخدم الشبكة');
    assert.deepEqual(seenHeaders.at(-1), { origin, host: '192.168.1.6:5173', hasCookie: true, hasCsrf: true });
    for (let i = 0; i < 2; i++) {
      const restored = await agent.get('/api/auth/me').set('Host', '192.168.1.6:5173').expect(200);
      assert.equal(restored.body.data.user.id, login.body.data.user.id);
    }
    const loggedOut = await agent.post('/api/auth/logout').set('Origin', origin).set('X-CSRF-Token', login.body.data.csrfToken).send({}).expect(200);
    assert.equal(loggedOut.body.data.user, null);
    assert.equal((await agent.get('/api/auth/me').expect(200)).body.data.user, null);
  }
});

test('the proxy preserves security checks for other origins, invalid CSRF, and cross-site requests', async () => {
  const agent = request.agent(vite.httpServer);
  const me = await agent.get('/api/auth/me').expect(200);
  const token = me.body.data.csrfToken;
  for (const origin of ['http://192.168.1.7:5173', 'http://192.168.1.6:5174', 'https://192.168.1.6:5173', 'https://attacker.example', 'null']) {
    const rejected = await post(agent, origin, token).expect(403);
    assert.equal(rejected.body.error.code, 'ORIGIN_INVALID');
  }
  for (const csrf of [undefined, '0'.repeat(64)]) {
    const rejected = await post(agent, phoneOrigin, csrf).expect(403);
    assert.equal(rejected.body.error.code, 'CSRF_INVALID');
  }
  const crossSite = await post(agent, phoneOrigin, token, { site: 'cross-site' }).expect(403);
  assert.equal(crossSite.body.error.code, 'ORIGIN_INVALID');
});

test('LAN authentication also works without Fetch Metadata, while Referer fallback remains restricted', async () => {
  const agent = request.agent(vite.httpServer);
  const me = await agent.get('/api/auth/me').expect(200);
  const rejected = await post(agent, undefined, me.body.data.csrfToken, { referer: 'https://attacker.example/login' }).expect(403);
  assert.equal(rejected.body.error.code, 'ORIGIN_INVALID');
  const login = await agent.post('/api/auth/login').set('Host', '192.168.1.6:5173').set('Origin', phoneOrigin)
    .set('X-CSRF-Token', me.body.data.csrfToken).send(profile).expect(200);
  assert.equal(login.body.data.user.fullName, 'مستخدم الشبكة');
  const refererLogin = await post(agent, undefined, login.body.data.csrfToken, { referer: `${phoneOrigin}/login` }).expect(200);
  assert.equal(refererLogin.body.data.user.id, login.body.data.user.id);
});
