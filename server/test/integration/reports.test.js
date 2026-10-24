import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import MongoStore from 'connect-mongo';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { connectDatabase, databaseAvailable } from '../../src/config/database.js';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import { createRateLimits } from '../../src/middleware/rateLimits.js';
import { hashPassword } from '../../src/utils/password.js';
import { User } from '../../src/models/User.js';
import { Zone } from '../../src/models/Zone.js';
import { CitizenReport } from '../../src/models/CitizenReport.js';

// Every fixture and cleanup below belongs to this disposable local database only.
const origin = 'http://localhost:5173';
let mongo, app, zones, users, agents, tokens, passwordHash;
const nonce = () => new mongoose.Types.ObjectId().toHexString() + '12345678';
const input = (values = {}) => ({ type: 'arrived', description: '', submissionId: nonce(), ...values });
const post = (body, index = 0) => agents[index].post('/api/reports').set('Origin', origin).set('X-CSRF-Token', tokens[index]).send(body);
async function signIn(user) {
  const agent = request.agent(app);
  const initial = await agent.get('/api/auth/me').expect(200);
  const response = await agent.post(user.role === 'council_admin' ? '/api/admin/login' : '/api/auth/login').set('Origin', origin).set('X-CSRF-Token', initial.body.data.csrfToken).send({ phone: user.phone, password: 'ReportFixture9!' }).expect(200);
  return { agent, token: response.body.data.csrfToken };
}
before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { downloadDir: fileURLToPath(new URL('../../../.cache/mongodb', import.meta.url)) } });
  const connection = await connectDatabase(mongo.getUri('isolated_citizen_reports_test'));
  await Promise.all([User.init(), Zone.init(), CitizenReport.init()]);
  zones = await Zone.insertMany(['حارة صاحب البلاغ للاختبار', 'حارة مواطن آخر للاختبار'].map((name) => ({ name })));
  passwordHash = await hashPassword('ReportFixture9!');
  users = await User.insertMany([
    { fullName: 'مواطن الاختبار الأول', phone: '0596711111', passwordHash, zoneId: zones[0]._id },
    { fullName: 'مواطن الاختبار الثاني', phone: '0596722222', passwordHash, zoneId: zones[1]._id },
  ]);
  const config = loadConfig({ SESSION_SECRET: 'citizen-report-tests-only-secret-at-least-32-characters', APP_ORIGINS: origin });
  const store = MongoStore.create({ client: connection.getClient(), collectionName: 'sessions' });
  store.on('error', () => {});
  app = createApp({ config, store, limits: await createRateLimits(connection), isDatabaseAvailable: databaseAvailable });
  const sessions = await Promise.all(users.map(signIn));
  agents = sessions.map((session) => session.agent); tokens = sessions.map((session) => session.token);
});
beforeEach(async () => {
  await CitizenReport.deleteMany({});
  await mongoose.connection.db.collection('auth_rate_limits').deleteMany({});
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

test('private report routes deny guests and never provide a public all-reports endpoint', async () => {
  for (const path of ['/api/reports/mine', '/api/reports', `/api/reports/${new mongoose.Types.ObjectId()}`]) await request(app).get(path).expect(401);
  const guest = request.agent(app), initial = await guest.get('/api/auth/me').expect(200);
  assert.equal(initial.body.data.user, null);
  await guest.post('/api/reports').set('Origin', origin).set('X-CSRF-Token', initial.body.data.csrfToken).send(input()).expect(401);
  await agents[0].get('/api/reports').expect(404);
  assert.equal(await CitizenReport.countDocuments(), 0);
});
test('report writes keep Origin and CSRF checks and derive owner, zone and initial status on the server', async () => {
  await agents[0].post('/api/reports').set('Origin', origin).send(input()).expect(403);
  await agents[0].post('/api/reports').set('Origin', 'http://untrusted.test').set('X-CSRF-Token', tokens[0]).send(input()).expect(403);
  for (const extra of [{ userId: String(users[1]._id) }, { zoneId: String(zones[1]._id) }, { status: 'resolved' }]) await post(input(extra)).expect(422);
  const response = await post(input()).expect(201);
  const report = response.body.data.report;
  assert.equal(report.status, 'new');
  assert.equal(report.zone.id, String(zones[0]._id));
  assert.deepEqual(Object.keys(report).sort(), ['createdAt', 'description', 'id', 'status', 'type', 'zone']);
  const stored = await CitizenReport.findById(report.id);
  assert.equal(String(stored.userId), String(users[0]._id));
  assert.equal(String(stored.zoneId), String(zones[0]._id));
  assert.equal(await CitizenReport.countDocuments(), 1);
});
test('the three types validate optional versus required text, reject invalid values, and save plain text', async () => {
  for (const values of [{ type: 'other' }, { type: 'water_problem', description: ' \n ' }, { description: {} }, { description: 'م'.repeat(2001) }, { submissionId: 'bad' }]) await post(input(values)).expect(422);
  for (const type of ['arrived', 'not_arrived', 'water_problem']) {
    const description = type === 'water_problem' ? 'تسريب في الشبكة.\n<script>plainTextOnly()</script>' : '';
    const response = await post(input({ type, description })).expect(201);
    assert.equal(response.body.data.report.description, description);
    assert.equal(response.body.data.report.type, type);
    assert.equal(response.body.data.report.status, 'new');
  }
});
test('safe retries reuse the saved report; conflicting payloads and excessive identical reports are blocked', async () => {
  const body = input({ description: 'تفاصيل اختبار التكرار' });
  const first = await post(body).expect(201);
  const replay = await post({ ...body, submissionId: body.submissionId.toUpperCase() }).expect(200);
  assert.equal(replay.body.data.report.id, first.body.data.report.id);
  assert.equal(replay.body.data.replayed, true);
  await post({ ...body, type: 'not_arrived' }).expect(409);
  const duplicate = await post({ ...body, submissionId: nonce() }).expect(429);
  assert.equal(duplicate.body.error.code, 'REPORT_DUPLICATE');
  assert.equal(await CitizenReport.countDocuments(), 1);
  await post(body, 1).expect(201); // Independent owner and zone, even with the same request ID.
});
test('simultaneous identical submissions cannot create two records', async () => {
  const body = input({ description: 'اختبار إرسال متزامن' });
  const responses = await Promise.all([post(body), post(body), post(body)]);
  assert.ok(responses.some((response) => response.status === 201));
  assert.ok(responses.every((response) => [200, 201, 429].includes(response.status)));
  assert.equal(await CitizenReport.countDocuments(), 1);
  await post(body).expect(200);
});
test('my reports show only the session owner, all stored statuses, and no administrative or identity fields', async () => {
  for (const [index, status] of ['new', 'reviewing', 'resolved', 'closed'].entries()) await CitizenReport.create({ userId: users[0]._id, zoneId: zones[0]._id, ...input({ description: `اختبار حالة ${status}` }), status, createdAt: new Date(`2026-01-0${index + 1}T08:00:00Z`) });
  const other = await CitizenReport.create({ userId: users[1]._id, zoneId: zones[1]._id, ...input({ description: 'لا يراه المواطن الأول' }) });
  const response = await agents[0].get('/api/reports/mine').expect(200);
  assert.deepEqual(response.body.data.reports.map((item) => item.status), ['closed', 'resolved', 'reviewing', 'new']);
  assert.ok(response.body.data.reports.every((item) => !('userId' in item) && !('submissionId' in item) && !('updatedAt' in item)));
  assert.ok(!JSON.stringify(response.body).includes('لا يراه المواطن الأول'));
  await agents[0].get(`/api/reports/mine?userId=${users[1]._id}`).expect(422);
  await agents[0].get(`/api/reports/${other._id}`).expect(404);
  const second = await agents[1].get('/api/reports/mine').expect(200);
  assert.equal(second.body.data.reports.length, 1);
  assert.equal(second.body.data.reports[0].id, String(other._id));
  await agents[0].patch(`/api/reports/${response.body.data.reports[0].id}`).set('Origin', origin).set('X-CSRF-Token', tokens[0]).send({ status: 'resolved' }).expect(404);
});
test('report pagination is stable, keeps historical deleted-zone references, and validates query input', async () => {
  await CitizenReport.insertMany(Array.from({ length: 23 }, (_, index) => ({ userId: users[0]._id, zoneId: index === 0 ? new mongoose.Types.ObjectId() : zones[0]._id, ...input({ description: `اختبار دفعة ${index}` }) })));
  const ids = [];
  for (const page of [1, 2, 3]) {
    const response = await agents[0].get(`/api/reports/mine?page=${page}`).expect(200);
    assert.equal(response.body.data.pagination.total, 23);
    assert.equal(response.body.data.pagination.hasMore, page < 3);
    ids.push(...response.body.data.reports.map((item) => item.id));
  }
  assert.equal(new Set(ids).size, 23);
  const last = await agents[0].get('/api/reports/mine?page=3').expect(200);
  assert.ok(last.body.data.reports.some((item) => item.zone === null));
  for (const query of ['page=0', 'page=-1', 'page=1.5', 'page=100000', 'page=1&page=2', 'userId[$ne]=x']) await agents[0].get(`/api/reports/mine?${query}`).expect(422);
});
test('a per-user limit rejects excessive new submission attempts without blocking other residents', async () => {
  for (let index = 0; index < 10; index++) await post(input({ description: `وصف بلاغ مختلف ${index}` })).expect(201);
  const limited = await post(input({ description: 'يتجاوز الحد' })).expect(429);
  assert.equal(limited.body.error.code, 'REPORT_RATE_LIMITED');
  await post(input({ description: 'بلاغ مواطن آخر' }), 1).expect(201);
});
test('missing zones and council roles cannot submit resident reports, and the model rejects invalid statuses', async () => {
  const orphan = await User.create({ fullName: 'مواطن بلا حارة', phone: '0596733333', passwordHash, zoneId: new mongoose.Types.ObjectId() });
  const admin = await User.create({ fullName: 'مدير اختبار', phone: '0596744444', passwordHash, zoneId: zones[0]._id, role: 'council_admin' });
  for (const [user, expected] of [[orphan, 409], [admin, 403]]) {
    const session = await signIn(user);
    await session.agent.post('/api/reports').set('Origin', origin).set('X-CSRF-Token', session.token).send(input()).expect(expected);
    if (expected === 403) await session.agent.get('/api/reports/mine').expect(403);
  }
  await assert.rejects(CitizenReport.create({ userId: users[0]._id, zoneId: zones[0]._id, ...input(), status: 'pumping' }), { name: 'ValidationError' });
  assert.equal(await CitizenReport.countDocuments(), 0);
});
test('the existing account API returns only the current profile, and logout revokes private report access', async () => {
  const profile = await agents[0].get(`/api/auth/me?userId=${users[1]._id}`).expect(200);
  assert.equal(profile.body.data.user.id, String(users[0]._id));
  assert.equal(profile.body.data.user.phone, users[0].phone);
  assert.equal(profile.body.data.user.zone.id, String(zones[0]._id));
  assert.ok(profile.body.data.user.createdAt);
  assert.ok(!JSON.stringify(profile.body).includes('passwordHash'));
  await agents[0].post('/api/auth/logout').set('Origin', origin).set('X-CSRF-Token', tokens[0]).send({}).expect(200);
  await agents[0].get('/api/reports/mine').expect(401);
  const loggedOut = await agents[0].get('/api/auth/me').expect(200);
  assert.equal(loggedOut.body.data.user, null);
});
