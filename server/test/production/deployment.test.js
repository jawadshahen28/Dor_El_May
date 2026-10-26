import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { connectDatabase } from '../../src/config/database.js';
import { User } from '../../src/models/User.js';
import { Zone } from '../../src/models/Zone.js';
import { hashPassword } from '../../src/utils/password.js';

// Runs the real production entry point against an isolated, disposable database.
// X-Forwarded-Proto simulates TLS termination; this is not a live HTTPS deployment.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const origin = 'https://staging.door.example';
const password = 'ProductionFixture9!';
const secret = randomBytes(48).toString('hex');
let mongo, child, port, output = '', citizen, admin;
const api = () => request(`http://127.0.0.1:${port}`);
const get = (path, cookie) => {
  const req = api().get(path).set('X-Forwarded-Proto', 'https');
  return cookie ? req.set('Cookie', cookie) : req;
};
const post = (path, cookie, csrf, body = {}) => api().post(path).set('X-Forwarded-Proto', 'https').set('Origin', origin).set('Cookie', cookie).set('X-CSRF-Token', csrf).send(body);
const cookieOf = (response) => response.headers['set-cookie'][0].split(';')[0];

async function start() {
  const listener = createServer();
  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
  port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  output = '';
  // Explicitly override all application settings: never connect to developer Atlas.
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '', MONGODB_URI: mongo.getUri('isolated_production_deployment_test'), SESSION_SECRET: secret, SESSION_DAYS: '30', APP_ORIGINS: origin, TRUST_PROXY_HOPS: '1' };
  child = spawn(process.execPath, ['server/src/index.js'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  for (let attempt = 0; attempt < 160; attempt++) {
    if (child.exitCode !== null) throw new Error('Production test server exited before readiness.');
    try { if ((await get('/api/health').timeout({ deadline: 3000 })).status === 200) return; } catch {}
    await delay(100);
  }
  throw new Error('Production test server did not become ready.');
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
}
async function login(user, path) {
  const initial = await get('/api/auth/me').expect(200);
  const response = await post(path, cookieOf(initial), initial.body.data.csrfToken, { phone: user.phone, password }).expect(200);
  assert.notEqual(cookieOf(response), cookieOf(initial));
  return { cookie: cookieOf(response), csrf: response.body.data.csrfToken, response };
}

before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { downloadDir: fileURLToPath(new URL('../../../.cache/mongodb', import.meta.url)) } });
  await connectDatabase(mongo.getUri('isolated_production_deployment_test'));
  await Promise.all([Zone.init(), User.init()]);
  const zone = await Zone.create({ name: 'حارة اختبار النشر' });
  const passwordHash = await hashPassword(password);
  citizen = await User.create({ fullName: 'مواطن اختبار النشر', phone: '0596311111', passwordHash, zoneId: zone._id });
  admin = await User.create({ fullName: 'مسؤول اختبار النشر', phone: '0596322222', passwordHash, role: 'admin' });
  await start();
});
after(async () => { await stop(); await mongoose.disconnect(); await mongo?.stop(); });

test('real production startup uses PORT and 0.0.0.0, serves SPA refresh routes/assets, and never replaces APIs with HTML', async () => {
  assert.ok(output.includes(`API: http://0.0.0.0:${port}`));
  const html = readFileSync(new URL('../../../client/dist/index.html', import.meta.url), 'utf8');
  for (const path of ['/', '/home', '/schedule', '/announcements', '/announcements/100000000000000000000001', '/reports', '/account', '/notifications', '/admin', '/admin/login', '/admin/water', '/admin/schedule']) {
    const response = await get(path).set('Accept', 'text/html').expect(200);
    assert.equal(response.text, html);
    assert.equal(response.headers['cache-control'], 'no-cache');
  }
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map((match) => match[1]);
  assert.ok(assets.length > 1);
  for (const path of assets) await get(path).expect(200);
  for (const path of ['/api/not-a-route', '/api']) {
    const response = await get(path).set('Accept', 'text/html').expect(404);
    assert.match(response.headers['content-type'], /application\/json/);
    assert.equal(response.body.error.code, 'NOT_FOUND');
  }
  for (const path of ['/assets/missing.js', '/server/.env', '/.env', '/.git/config']) await get(path).set('Accept', 'text/html').expect(404);
  await get('/home').set('Accept', 'application/json').expect(404);
  const health = await get('/api/health').expect(200);
  assert.equal(health.body.data.database, 'connected');
  assert.equal(health.headers['set-cookie'], undefined);
  assert.match(health.headers['content-security-policy'], /connect-src 'self'/);
  assert.match(health.headers['strict-transport-security'], /max-age=/);
});

test('download/setup have crawler-visible metadata, no login requirement, and a safe legacy redirect', async () => {
  for (const path of ['/download', '/setup']) {
    const response = await get(path).expect(200);
    assert.match(response.headers['content-type'], /text\/html/);
    assert.equal(response.headers['set-cookie'], undefined);
    assert.equal(response.headers.location, undefined);
    assert.equal(response.headers['cache-control'], 'no-cache');
    const html = readFileSync(new URL(`../../../client/dist${path}.html`, import.meta.url), 'utf8');
    assert.equal(response.text, html);
    assert.match(html, /<title>دور المي \| مجلس قروي تلفيت<\/title>/);
    assert.match(html, /property="og:image" content="https:\/\/dor-el-may-talfit-staging.onrender.com\/images\/talfit-council-logo.jpg"/);
    assert.match(html, /rel="manifest"/);
  }
  await get('/browser-test?next=https://untrusted.example').expect('Location', '/download').expect(302);
  await get('/browser-test/browser-test.js').expect(404);
});

test('citizen/admin auth, authorization, CSRF, Origin and secure cookies work behind the simulated HTTPS proxy', async () => {
  await get('/api/admin/dashboard').expect(401);
  for (const path of ['/api/admin/water', '/api/admin/water-rounds']) await get(path).expect(401);
  const resident = await login(citizen, '/api/auth/login');
  const header = resident.response.headers['set-cookie'][0];
  for (const pattern of [/^__Host-door\.sid=/, /; Secure/, /; HttpOnly/, /; SameSite=Lax/, /; Path=\//]) assert.match(header, pattern);
  assert.doesNotMatch(header, /Domain=/);
  for (const path of ['/api/home/summary', '/api/water-rounds', '/api/announcements', '/api/reports/mine']) await get(path, resident.cookie).expect(200);
  await get('/api/admin/dashboard', resident.cookie).expect(403);
  for (const path of ['/api/admin/water', '/api/admin/water-rounds']) await get(path, resident.cookie).expect(403);
  await post('/api/auth/logout', resident.cookie, '0'.repeat(64)).expect(403);
  await api().post('/api/auth/logout').set('X-Forwarded-Proto', 'https').set('Origin', 'https://attacker.example').set('Cookie', resident.cookie).set('X-CSRF-Token', resident.csrf).send({}).expect(403);
  const council = await login(admin, '/api/admin/login');
  const dashboard = await get('/api/admin/dashboard', council.cookie).expect(200);
  assert.equal(dashboard.body.data.admin.id, String(admin._id));
  assert.equal(dashboard.body.data.statistics.registeredCitizens, 1);
  assert.doesNotMatch(JSON.stringify(dashboard.body), /passwordHash|sessionSecret|\$argon2/);
  await post('/api/admin/logout', council.cookie, council.csrf).expect(200);
  await get('/api/admin/dashboard', council.cookie).expect(401);
  await post('/api/auth/logout', resident.cookie, resident.csrf).expect(200);
  await get('/api/home/summary', resident.cookie).expect(401);
});

test('production serves the PWA manifest, worker, offline document and icons with safe headers', async () => {
  const manifest = await get('/manifest.webmanifest').expect(200);
  assert.match(manifest.headers['content-type'], /application\/manifest\+json/);
  assert.equal(manifest.headers['cache-control'], 'no-cache');
  const data = typeof manifest.body.name === 'string' ? manifest.body : JSON.parse(manifest.text);
  assert.equal(data.start_url, '/');
  assert.equal(data.display, 'standalone');
  const worker = await get('/sw.js').expect(200);
  assert.match(worker.headers['content-type'], /javascript/);
  assert.equal(worker.headers['cache-control'], 'no-cache');
  assert.equal(worker.headers['service-worker-allowed'], '/');
  const offline = await get('/offline.html').expect(200);
  assert.match(offline.text, /لا يوجد اتصال بالإنترنت/);
  assert.match(offline.headers['content-security-policy'], /worker-src 'self'/);
  for (const icon of data.icons) await get(icon.src).expect('Content-Type', /image\/png/).expect(200);
  await get('/icons/apple-touch-icon.png').expect(200);
  const unknownApi = await get('/api/pwa-not-a-route').set('Accept', 'text/html').expect(404);
  assert.match(unknownApi.headers['content-type'], /application\/json/);
});

test('production serves Android asset links as public JSON without redirects or sessions', async () => {
  const source = readFileSync(new URL('../../../client/public/.well-known/assetlinks.json', import.meta.url), 'utf8');
  for (const accept of ['application/json', 'text/html']) {
    const response = await get('/.well-known/assetlinks.json').set('Accept', accept).expect(200);
    assert.match(response.headers['content-type'], /^application\/json\b/);
    assert.equal(response.text, source);
    assert.deepEqual(response.body, JSON.parse(source));
    assert.equal(response.headers.location, undefined);
    assert.equal(response.headers['set-cookie'], undefined);
  }
  await api().head('/.well-known/assetlinks.json').expect('Content-Type', /application\/json/).expect(200);
  for (const path of ['/.well-known/missing.json', '/.well-known/.env', '/.env', '/.git/config']) {
    await get(path).set('Accept', 'text/html').expect(404);
  }
});

test('both authenticated sessions survive a real Express process restart using the existing MongoDB store', async () => {
  const resident = await login(citizen, '/api/auth/login');
  const council = await login(admin, '/api/admin/login');
  await stop();
  await start();
  assert.equal((await get('/api/auth/me', resident.cookie).expect(200)).body.data.user.id, String(citizen._id));
  assert.equal((await get('/api/admin/dashboard', council.cookie).expect(200)).body.data.admin.id, String(admin._id));
});

test('readiness rejects a database outage, then the MongoDB driver reconnects and restores the same admin session', { timeout: 60000 }, async () => {
  const council = await login(admin, '/api/admin/login');
  const signed = decodeURIComponent(council.cookie.slice(council.cookie.indexOf('=') + 1));
  const sessionId = signed.slice(2, signed.lastIndexOf('.'));
  assert.ok(await mongoose.connection.db.collection('sessions').findOne({ _id: sessionId }), 'Admin session exists before the outage.');
  const databasePath = mongo.instanceInfo.dbPath;
  // The Windows test helper forcibly stops mongod. Flush acknowledged fixtures
  // so this test exercises connectivity recovery, rather than unjournaled data loss.
  await mongoose.connection.db.admin().command({ fsync: 1 });
  await mongo.stop({ doCleanup: false });
  await get('/api/health').timeout({ deadline: 4500 }).expect(503);
  await mongo.start(true);
  let recovered = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await get('/api/health').timeout({ deadline: 3000 })).status === 200) { recovered = true; break; } } catch {}
    await delay(150);
  }
  assert.ok(recovered, 'Database readiness should recover after the local MongoDB process returns.');
  assert.equal(mongo.instanceInfo.dbPath, databasePath, 'Restart reuses the test database files.');
  assert.ok(await User.exists({ _id: admin._id }), 'Restart preserves the test administrator.');
  assert.ok(await mongoose.connection.db.collection('sessions').findOne({ _id: sessionId }), 'Restart preserves the test admin session.');
  await get('/api/admin/dashboard', council.cookie).expect(200);
});
