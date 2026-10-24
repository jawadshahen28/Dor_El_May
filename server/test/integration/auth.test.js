import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import MongoStore from 'connect-mongo';
import request from 'supertest';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import { connectDatabase, databaseAvailable } from '../../src/config/database.js';
import { createRateLimits } from '../../src/middleware/rateLimits.js';
import { User } from '../../src/models/User.js';
import { Zone } from '../../src/models/Zone.js';

// This suite NEVER touches Atlas or a developer's MONGODB_URI.
// It uses a disposable, real local mongod process and the actual connect-mongo store.
let mongo, store, app, zone;
const origin = 'http://localhost:5173';
const config = loadConfig({ SESSION_SECRET: 'integration-only-secret-32-characters-long', APP_ORIGINS: origin });
const profile = { fullName: '  أحمد   محمد  ', phone: '0599123456', password: 'SecurePass9!', confirmPassword: 'SecurePass9!' };

before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { downloadDir: fileURLToPath(new URL('../../../.cache/mongodb', import.meta.url)) } });
  const connection = await connectDatabase(mongo.getUri('door_el_may_test'));
  await Promise.all([User.init(), Zone.init()]);
  zone = await Zone.create({ name: 'حارة للاختبار' });
  await Zone.create({ name: 'حارة غير نشطة', isActive: false });
  store = MongoStore.create({ client: connection.getClient(), collectionName: 'sessions' });
  store.on('error', () => {});
  const limits = await createRateLimits(connection);
  app = createApp({ config, store, limits, isDatabaseAvailable: databaseAvailable });
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

async function startSession(agent) {
  const response = await agent.get('/api/auth/me').expect(200);
  assert.equal(response.body.data.user, null);
  return { csrf: response.body.data.csrfToken, cookie: response.headers['set-cookie'][0].split(';')[0] };
}
const send = (agent, path, csrf, body = {}) => agent.post(`/api/auth/${path}`).set('Origin', origin).set('X-CSRF-Token', csrf).send(body);

test('zones come from MongoDB and inactive neighborhoods are excluded', async () => {
  const response = await request(app).get('/api/zones').expect(200);
  assert.deepEqual(response.body.data.zones, [{ id: String(zone._id), name: 'حارة للاختبار' }]);
});

test('CSRF rejects missing tokens and untrusted origins', async () => {
  const agent = request.agent(app);
  const { csrf } = await startSession(agent);
  await agent.post('/api/auth/register').set('Origin', origin).send(profile).expect(403);
  await agent.post('/api/auth/register').set('Origin', 'https://attacker.example').set('X-CSRF-Token', csrf).send(profile).expect(403);
});

test('registration validates fields and rejects nonexistent zones', async () => {
  const agent = request.agent(app);
  const { csrf } = await startSession(agent);
  const response = await send(agent, 'register', csrf, { ...profile, zoneId: String(zone._id), confirmPassword: 'Mismatch9' }).expect(422);
  assert.ok(response.body.error.fields.confirmPassword);
  await send(agent, 'register', csrf, { ...profile, zoneId: '507f1f77bcf86cd799439011' }).expect(422);
});

test('registration, persistent Mongo session, restart, login, duplicate, logout, and session invalidation', async () => {
  const agent = request.agent(app);
  const { csrf, cookie: beforeCookie } = await startSession(agent);
  const registered = await send(agent, 'register', csrf, { ...profile, zoneId: String(zone._id), role: 'council_admin', phoneVerified: true }).expect(201);
  assert.equal(registered.body.data.user.fullName, 'أحمد محمد');
  assert.equal(registered.body.data.user.role, 'resident');
  assert.equal(registered.body.data.user.phoneVerified, false);
  assert.equal(registered.body.data.user.zone.name, 'حارة للاختبار');
  assert.ok(!JSON.stringify(registered.body).includes('passwordHash'));
  const cookie = registered.headers['set-cookie'][0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Expires=/);
  assert.notEqual(cookie.split(';')[0], beforeCookie);
  const raw = await User.findOne({ phone: profile.phone }).select('+passwordHash');
  assert.match(raw.passwordHash, /^\$argon2id\$/);
  assert.equal((await User.findById(raw._id).lean()).passwordHash, undefined);
  assert.ok(await mongoose.connection.db.collection('sessions').countDocuments() >= 1);
  const refreshed = await agent.get('/api/auth/me').expect(200);
  assert.equal(refreshed.body.data.user.id, String(raw._id));

  // A new Express app using the same Mongo store proves no in-process session state is needed.
  const restarted = createApp({ config, store, limits: await createRateLimits(mongoose.connection), isDatabaseAvailable: databaseAvailable });
  const restored = await request(restarted).get('/api/auth/me').set('Cookie', cookie.split(';')[0]).expect(200);
  assert.equal(restored.body.data.user.id, String(raw._id));

  const otherDevice = request.agent(app);
  const other = await startSession(otherDevice);
  await send(otherDevice, 'register', other.csrf, { ...profile, phone: '٠٥٩٩١٢٣٤٥٦', zoneId: String(zone._id) }).expect(409);
  await send(otherDevice, 'login', other.csrf, { phone: profile.phone, password: 'WrongPass9' }).expect(401);
  const login = await send(otherDevice, 'login', other.csrf, { phone: profile.phone, password: profile.password }).expect(200);
  assert.equal(login.body.data.user.id, String(raw._id));
  await send(otherDevice, 'logout', login.body.data.csrfToken).expect(200);
  assert.equal((await otherDevice.get('/api/auth/me').expect(200)).body.data.user, null);

  await send(agent, 'logout', refreshed.body.data.csrfToken).expect(200);
  const replay = await request(app).get('/api/auth/me').set('Cookie', cookie.split(';')[0]).expect(200);
  assert.equal(replay.body.data.user, null);
});

test('brute-force limiter stops repeated attempts for a phone', async () => {
  const agent = request.agent(app);
  const { csrf } = await startSession(agent);
  for (let i = 0; i < 10; i++) await send(agent, 'login', csrf, { phone: '0502345678', password: 'WrongPass9' }).expect(401);
  const blocked = await send(agent, 'login', csrf, { phone: '0502345678', password: 'WrongPass9' }).expect(429);
  assert.equal(blocked.body.error.code, 'RATE_LIMITED');
});

test('expired Mongo sessions cannot restore the user', async () => {
  const agent = request.agent(app);
  const { csrf } = await startSession(agent);
  const login = await send(agent, 'login', csrf, { phone: profile.phone, password: profile.password }).expect(200);
  const sessionCookie = login.headers['set-cookie'][0].split(';')[0];
  const signed = decodeURIComponent(sessionCookie.slice(sessionCookie.indexOf('=') + 1));
  const sessionId = signed.slice(2, signed.lastIndexOf('.'));
  await mongoose.connection.db.collection('sessions').updateOne({ _id: sessionId }, { $set: { expires: new Date(Date.now() - 1000) } });
  const expired = await agent.get('/api/auth/me').expect(200);
  assert.equal(expired.body.data.user, null);
});

test('production cookies are HttpOnly, Secure, host-scoped, and expire in 30 days', async () => {
  const productionConfig = { ...config, production: true, cookieName: '__Host-door.sid', trustProxyHops: 1, origins: ['https://door.example'] };
  const productionApp = createApp({ config: productionConfig, store, limits: await createRateLimits(mongoose.connection), isDatabaseAvailable: databaseAvailable });
  const secure = await request(productionApp).get('/api/auth/me').set('X-Forwarded-Proto', 'https').expect(200);
  const cookie = secure.headers['set-cookie'][0];
  assert.match(cookie, /^__Host-door\.sid=/);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; Path=\//);
  assert.match(cookie, /; SameSite=Lax/);
  assert.doesNotMatch(cookie, /Domain=/);
  const expiry = new Date(cookie.match(/Expires=([^;]+)/)[1]);
  assert.ok(Math.abs(expiry.getTime() - Date.now() - 30 * 86400000) < 5000);
  const plain = await request(productionApp).get('/api/auth/me').expect(200);
  assert.equal(plain.headers['set-cookie'], undefined);
});
