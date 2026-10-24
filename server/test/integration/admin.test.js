import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import MongoStore from 'connect-mongo';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import { connectDatabase, databaseAvailable } from '../../src/config/database.js';
import { createRateLimits } from '../../src/middleware/rateLimits.js';
import { hashPassword, verifyPassword } from '../../src/utils/password.js';
import { User } from '../../src/models/User.js';
import { Zone } from '../../src/models/Zone.js';
import { WaterRound } from '../../src/models/WaterRound.js';
import { Announcement } from '../../src/models/Announcement.js';
import { CitizenReport } from '../../src/models/CitizenReport.js';
import { getAdminDashboard } from '../../src/services/adminDashboard.js';
import { createAdminAccount } from '../../src/services/adminAccounts.js';

// Disposable real MongoDB only. No Atlas connection or application account creation.
const origin = 'http://localhost:5173';
const config = loadConfig({ SESSION_SECRET: 'isolated-admin-tests-secret-at-least-32-characters', APP_ORIGINS: origin });
const password = 'AdminFixturePass9!';
const now = new Date('2026-01-02T22:30:00Z'); // Jan 3, 00:30 in Asia/Hebron.
const publication = new Date('2026-01-01T10:00:00Z');
let mongo, store, app, admin, citizen, zone, passwordHash;
const post = (agent, path, token, body = {}) => agent.post(`/api/${path}`).set('Origin', origin).set('X-CSRF-Token', token).send(body);
async function session() {
  const agent = request.agent(app);
  const response = await agent.get('/api/auth/me').expect(200);
  return { agent, token: response.body.data.csrfToken, cookie: response.headers['set-cookie'][0].split(';')[0] };
}
async function signIn(user = admin, path = 'admin/login') {
  const initial = await session();
  const response = await post(initial.agent, path, initial.token, { phone: user.phone, password }).expect(200);
  return { ...initial, token: response.body.data.csrfToken, response };
}
function noSecrets(value) {
  assert.doesNotMatch(JSON.stringify(value), /password|argon2|sessionSecret|submissionId|description|userId/);
}
const round = (values = {}) => WaterRound.create({ zoneId: zone._id, scheduledDate: '2026-01-03', scheduledTime: '09:00', publishedAt: publication, ...values });

before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { downloadDir: fileURLToPath(new URL('../../../.cache/mongodb', import.meta.url)) } });
  const connection = await connectDatabase(mongo.getUri('isolated_council_admin_test'));
  await Promise.all([User.init(), Zone.init(), WaterRound.init(), Announcement.init(), CitizenReport.init()]);
  passwordHash = await hashPassword(password);
  store = MongoStore.create({ client: connection.getClient(), collectionName: 'sessions' });
  store.on('error', () => {});
  app = createApp({ config, store, limits: await createRateLimits(connection), isDatabaseAvailable: databaseAvailable });
});
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Zone.deleteMany({}), WaterRound.deleteMany({}), Announcement.deleteMany({}), CitizenReport.deleteMany({}), mongoose.connection.db.collection('auth_rate_limits').deleteMany({})]);
  zone = await Zone.create({ name: 'حارة اختبار المجلس' });
  admin = await User.create({ fullName: 'مسؤول اختبار المجلس', phone: '0596511111', passwordHash, role: 'admin' });
  citizen = await User.create({ fullName: 'مواطن اختبار المجلس', phone: '0596522222', passwordHash, zoneId: zone._id });
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

test('guests and citizens cannot access any protected admin API or choose a client role', async () => {
  for (const path of ['dashboard', 'me']) await request(app).get(`/api/admin/${path}?role=admin`).set('X-Role', 'admin').expect(401);
  const { agent, token } = await signIn(citizen, 'auth/login');
  for (const path of ['dashboard', 'me']) await agent.get(`/api/admin/${path}?role=admin`).expect(403);
  await post(agent, 'admin/logout', token, { role: 'admin' }).expect(403);
  const denied = await post(agent, 'admin/login', token, { phone: citizen.phone, password, role: 'admin' }).expect(401);
  assert.equal(denied.body.error.code, 'INVALID_CREDENTIALS');
  assert.equal((await agent.get('/api/auth/me')).body.data.user.id, String(citizen._id));
  await agent.get('/api/home/summary').expect(200);
});

test('invalid, unknown, citizen, and disabled admin credentials share the same generic error', async () => {
  const { agent, token } = await session();
  const results = [];
  for (const values of [{ phone: admin.phone, password: 'IncorrectPass9' }, { phone: '0596599999', password }, { phone: citizen.phone, password }]) {
    results.push((await post(agent, 'admin/login', token, values).expect(401)).body);
  }
  await User.updateOne({ _id: admin._id }, { $set: { status: 'disabled' } });
  results.push((await post(agent, 'admin/login', token, { phone: admin.phone, password }).expect(401)).body);
  for (const result of results) assert.deepEqual(result, results[0]);
  noSecrets(results);
});

test('admin session rotates cookie and CSRF, persists across app restart, and exposes safe profiles', async () => {
  const { agent, cookie, token, response } = await signIn();
  const newCookie = response.headers['set-cookie'][0].split(';')[0];
  assert.notEqual(newCookie, cookie);
  assert.match(response.headers['set-cookie'][0], /HttpOnly/);
  assert.match(response.headers['set-cookie'][0], /SameSite=Lax/);
  noSecrets(response.body);
  assert.equal(response.body.data.user.role, 'admin');
  const old = await request(app).get('/api/auth/me').set('Cookie', cookie).expect(200);
  assert.equal(old.body.data.user, null);
  const restarted = createApp({ config, store, limits: await createRateLimits(mongoose.connection), isDatabaseAvailable: databaseAvailable });
  const restored = await request(restarted).get('/api/admin/dashboard').set('Cookie', newCookie).expect(200);
  assert.equal(restored.body.data.admin.fullName, admin.fullName);
  assert.equal(restored.headers['cache-control'], 'no-store');
  noSecrets(restored.body);
  const me = await agent.get('/api/admin/me').expect(200);
  assert.equal(me.body.data.admin.status, 'active');
  noSecrets(me.body);
  await post(agent, 'admin/logout', token).expect(200);
  await request(app).get('/api/admin/dashboard').set('Cookie', newCookie).expect(401);
});

test('CSRF and origin protections apply to admin login and logout; old CSRF fails after elevation', async () => {
  const { agent, token } = await session();
  await agent.post('/api/admin/login').send({ phone: admin.phone, password }).expect(403);
  await agent.post('/api/admin/login').set('Origin', 'https://attacker.example').set('X-CSRF-Token', token).send({ phone: admin.phone, password }).expect(403);
  const response = await post(agent, 'admin/login', token, { phone: admin.phone, password }).expect(200);
  assert.notEqual(response.body.data.csrfToken, token);
  await post(agent, 'admin/logout', token).expect(403);
  await agent.get('/api/admin/dashboard').expect(200);
  await post(agent, 'admin/logout', response.body.data.csrfToken).expect(200);
});

test('admin logout destroys server session and expires the cookie', async () => {
  const { agent, token, response } = await signIn();
  const cookie = response.headers['set-cookie'][0].split(';')[0];
  const logout = await post(agent, 'admin/logout', token).expect(200);
  assert.match(logout.headers['set-cookie'][0], /Expires=Thu, 01 Jan 1970/);
  await request(app).get('/api/admin/dashboard').set('Cookie', cookie).expect(401);
  assert.equal((await agent.get('/api/auth/me')).body.data.user, null);
});

test('server rechecks role and status on every request; deleted and expired sessions fail closed', async () => {
  let signed = await signIn();
  await User.updateOne({ _id: admin._id }, { $set: { role: 'resident' } });
  await signed.agent.get('/api/admin/dashboard').expect(403);
  await User.updateOne({ _id: admin._id }, { $set: { role: 'admin', status: 'disabled' } });
  await signed.agent.get('/api/admin/dashboard').expect(401);
  await User.updateOne({ _id: admin._id }, { $set: { status: 'active' } });
  signed = await signIn();
  const cookie = signed.response.headers['set-cookie'][0].split(';')[0];
  const decoded = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
  const id = decoded.slice(2, decoded.lastIndexOf('.'));
  await mongoose.connection.db.collection('sessions').updateOne({ _id: id }, { $set: { expires: new Date(0) } });
  await signed.agent.get('/api/admin/dashboard').expect(401);
  signed = await signIn();
  await User.deleteOne({ _id: admin._id });
  await signed.agent.get('/api/admin/dashboard').expect(401);
});

test('legacy council_admin role remains supported and admin credentials do not enter citizen login', async () => {
  await User.updateOne({ _id: admin._id }, { $set: { role: 'council_admin' }, $unset: { status: 1 } });
  const signed = await signIn();
  await signed.agent.get('/api/admin/dashboard').expect(200);
  const { agent, token } = await session();
  await post(agent, 'auth/login', token, { phone: admin.phone, password }).expect(401);
});

test('existing resident without stored role/status retains login and is counted without rewriting the account', async () => {
  await User.collection.updateOne({ _id: citizen._id }, { $unset: { role: 1, status: 1 } });
  const signed = await signIn(citizen, 'auth/login');
  await signed.agent.get('/api/home/summary').expect(200);
  await signed.agent.get('/api/admin/dashboard').expect(403);
  assert.equal((await getAdminDashboard(admin, { now })).statistics.registeredCitizens, 1);
  const raw = await User.collection.findOne({ _id: citizen._id });
  assert.equal(raw.role, undefined);
  assert.equal(raw.status, undefined);
});

test('dashboard gives true zeros and empty lists when all data collections are empty', async () => {
  await User.deleteOne({ _id: citizen._id });
  const { agent } = await signIn();
  const response = await agent.get('/api/admin/dashboard').expect(200);
  assert.deepEqual(response.body.data.statistics, { registeredCitizens: 0, activePumpingRounds: 0, upcomingWaterRounds: 0, newReports: 0, publishedAnnouncements: 0 });
  for (const key of ['activeRounds', 'upcomingRounds', 'recentReports']) assert.deepEqual(response.body.data[key], []);
  assert.equal(response.body.data.waterLastUpdatedAt, null);
  assert.equal(response.body.data.timeZone, 'Asia/Hebron');
  assert.equal(await WaterRound.countDocuments(), 0);
  assert.equal(await Announcement.countDocuments(), 0);
  assert.equal(await CitizenReport.countDocuments(), 0);
});

test('statistics use explicit published pumping, chronological upcoming rounds, and Palestine date boundaries', async () => {
  await round({ status: 'pumping', actualStartedAt: publication });
  const anotherZone = await Zone.create({ name: 'حارة ضخ ثانية', isActive: false });
  await round({ zoneId: anotherZone._id, status: 'pumping', actualStartedAt: null });
  await round({ status: 'pumping', publishedAt: null });
  await round({ status: 'pumping', publishedAt: new Date('2026-01-10T00:00:00Z') });
  await round({ status: 'pumping', zoneId: new mongoose.Types.ObjectId() });
  for (const values of [{ scheduledDate: '2026-01-02' }, { scheduledTime: '00:29' }, { publishedAt: null }, { status: 'cancelled' }, { status: 'completed' }]) await round(values);
  await round({ scheduledTime: '00:31', zoneId: new mongoose.Types.ObjectId() });
  const expected = [];
  for (const scheduledTime of [null, '00:30', '01:00', '02:00', '03:00', '04:00']) expected.push(await round({ scheduledTime }));
  const result = await getAdminDashboard(admin, { now });
  assert.equal(result.statistics.registeredCitizens, 1);
  assert.equal(result.statistics.activePumpingRounds, 2);
  assert.ok(result.activeRounds.some((item) => item.actualStartedAt === null));
  assert.equal(result.statistics.upcomingWaterRounds, 6);
  assert.deepEqual(result.upcomingRounds.map((item) => item.id), expected.slice(0, 5).map((item) => String(item._id)));
  assert.equal(result.upcomingRounds[0].scheduledTime, null);
  assert.ok(result.waterLastUpdatedAt);
});

test('published announcement counts and recent report summaries exclude drafts and personal information', async () => {
  for (const values of [{ status: 'draft', publishedAt: publication }, { status: 'published' }, { status: 'published', publishedAt: new Date('2026-01-10T00:00:00Z') }, { status: 'published', publishedAt: publication }]) {
    await Announcement.create({ title: 'إعلان اختبار', content: 'نص اختبار', ...values });
  }
  for (let i = 0; i < 7; i++) await CitizenReport.create({ userId: citizen._id, zoneId: zone._id, type: 'water_problem', description: 'Private citizen details', status: i < 3 ? 'new' : 'resolved', submissionId: new mongoose.Types.ObjectId().toHexString() + '12345678', createdAt: new Date(now.getTime() + i * 1000) });
  const result = await getAdminDashboard(admin, { now });
  assert.equal(result.statistics.newReports, 3);
  assert.equal(result.statistics.publishedAnnouncements, 1);
  assert.equal(result.recentReports.length, 5);
  assert.ok(new Date(result.recentReports[0].createdAt) > new Date(result.recentReports[1].createdAt));
  assert.deepEqual(Object.keys(result.recentReports[0]).sort(), ['createdAt', 'id', 'status', 'type', 'zone']);
  noSecrets(result);
  assert.ok(!JSON.stringify(result).includes(citizen.phone));
  assert.ok(!JSON.stringify(result).includes('Private citizen details'));
});

test('explicit local creation validates, hashes, rejects duplicates, and never promotes an existing citizen', async () => {
  const values = { fullName: 'مسؤول محلي جديد', phone: '0596533333', password, confirmPassword: password };
  const created = await createAdminAccount(values);
  assert.equal(created.role, 'admin');
  assert.equal(created.status, 'active');
  const stored = await User.findById(created.id).select('+passwordHash');
  assert.equal(stored.zoneId, undefined);
  assert.match(stored.passwordHash, /^\$argon2id\$/);
  assert.ok(await verifyPassword(stored.passwordHash, password));
  noSecrets(created);
  await assert.rejects(createAdminAccount({ ...values, phone: '٠٥٩٦٥٣٣٣٣٣' }), { code: 'ACCOUNT_EXISTS' });
  await assert.rejects(createAdminAccount({ ...values, phone: citizen.phone }), { code: 'ACCOUNT_EXISTS' });
  assert.equal((await User.findById(citizen._id)).role, 'resident');
  for (const changes of [{ password: 'Short9', confirmPassword: 'Short9' }, { phone: 'invalid' }, { fullName: 'Single' }, { confirmPassword: 'Mismatch9!' }]) {
    await assert.rejects(createAdminAccount({ ...values, ...changes }), { code: 'VALIDATION_ERROR' });
  }
});

test('normal startup never creates an admin; public registration and all domain writes remain unavailable', async () => {
  await User.deleteOne({ _id: admin._id });
  createApp({ config, store, limits: await createRateLimits(mongoose.connection), isDatabaseAvailable: databaseAvailable });
  assert.equal(await User.countDocuments({ role: 'admin' }), 0);
  const { agent, token } = await signIn(citizen, 'auth/login');
  const registered = await post(agent, 'auth/register', token, { fullName: 'مواطن تسجيل جديد', phone: '0596544444', zoneId: String(zone._id), password, confirmPassword: password, role: 'admin', status: 'active' }).expect(201);
  assert.equal(registered.body.data.user.role, 'resident');
  await agent.get('/api/admin/dashboard').expect(403);
  await User.create({ fullName: 'مسؤول اختبار آخر', phone: admin.phone, passwordHash, role: 'admin' });
  const signed = await signIn();
  for (const path of ['register', 'dashboard', 'pumping', 'water-rounds', 'announcements', 'reports', 'users', 'settings']) {
    await post(signed.agent, `admin/${path}`, signed.token, {}).expect(404);
  }
});

test('admin phone and IP limiters are persistent and independent of citizen login', async () => {
  const { agent, token, cookie } = await session();
  for (let i = 0; i < 10; i++) await post(agent, 'admin/login', token, { phone: admin.phone, password: 'WrongPass9' }).expect(401);
  await post(agent, 'admin/login', token, { phone: admin.phone, password }).expect(429);
  const restarted = createApp({ config, store, limits: await createRateLimits(mongoose.connection), isDatabaseAvailable: databaseAvailable });
  await request(restarted).post('/api/admin/login').set('Cookie', cookie).set('Origin', origin).set('X-CSRF-Token', token).send({ phone: admin.phone, password }).expect(429);
  const signed = await signIn(citizen, 'auth/login');
  await signed.agent.get('/api/home/summary').expect(200);
  // Phone was changed each time; the independent 25/IP allowance still applies.
  for (let i = 0; i < 13; i++) await post(agent, 'admin/login', token, { phone: `05966${String(i).padStart(5, '0')}`, password }).expect(401);
  await post(agent, 'admin/login', token, { phone: '0596699999', password }).expect(429);
});
