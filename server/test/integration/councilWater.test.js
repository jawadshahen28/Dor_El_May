import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import MongoStore from 'connect-mongo';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import { connectDatabase, databaseAvailable } from '../../src/config/database.js';
import { createRateLimits } from '../../src/middleware/rateLimits.js';
import { hashPassword } from '../../src/utils/password.js';
import { User } from '../../src/models/User.js';
import { Zone } from '../../src/models/Zone.js';
import { WaterRound } from '../../src/models/WaterRound.js';

// Explicit disposable MongoDB only. Never load .env, Atlas, residents or real push endpoints.
const origin = 'http://localhost:5173';
const password = 'CouncilWaterFixture9!';
const date = '2095-06-15', month = '2095-06';
let mongo, app, zones, admin, citizen, otherCitizen, passwordHash, signed, resident;
const write = (session, path, body = {}, method = 'post') => session.agent[method]('/api/admin/' + path).set('Origin', origin).set('X-CSRF-Token', session.csrf).send(body);
async function signIn(user, route) {
  const agent = request.agent(app);
  const initial = (await agent.get('/api/auth/me').expect(200)).body.data;
  const response = await agent.post('/api/' + route).set('Origin', origin).set('X-CSRF-Token', initial.csrfToken).send({ phone: user.phone, password }).expect(200);
  return { agent, csrf: response.body.data.csrfToken };
}
const values = (extra = {}) => ({ zoneId: String(zones[0]._id), scheduledDate: date, scheduledTime: null, requestId: randomUUID(), ...extra });
async function create(extra = {}) { return (await write(signed, 'water-rounds', values(extra)).expect(201)).body.data.round; }
async function change(round, action, expected = 200, extra = {}) {
  return write(signed, `water-rounds/${round.id}/${action}`, { revision: round.revision, ...extra }).expect(expected);
}
async function published(extra = {}) { const round = await create(extra); return (await change(round, 'publish')).body.data.round; }
async function stored(id) { return WaterRound.findById(id).select('+audit +notificationEvents +creationKey +creationFingerprint').lean(); }
function privateMetadataAbsent(body) { assert.doesNotMatch(JSON.stringify(body), /passwordHash|creationKey|creationFingerprint|notificationEvents|createdBy|actualStartedBy|audit|phone|sessionSecret/); }

before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { downloadDir: fileURLToPath(new URL('../../../.cache/mongodb', import.meta.url)) } });
  const connection = await connectDatabase(mongo.getUri('isolated_council_water_test'));
  await Promise.all([User.init(), Zone.init(), WaterRound.init()]);
  passwordHash = await hashPassword(password);
  const config = loadConfig({ SESSION_SECRET: 'isolated-council-water-session-secret-32-characters', APP_ORIGINS: origin });
  const store = MongoStore.create({ client: connection.getClient(), collectionName: 'sessions' });
  store.on('error', () => {});
  app = createApp({ config, store, limits: await createRateLimits(connection), isDatabaseAvailable: databaseAvailable });
});
beforeEach(async () => {
  await Promise.all([WaterRound.deleteMany({}), Zone.deleteMany({}), User.deleteMany({}), mongoose.connection.db.collection('auth_rate_limits').deleteMany({})]);
  zones = await Zone.insertMany([{ name: 'حارة إدارة أولى' }, { name: 'حارة إدارة ثانية' }, { name: 'حارة غير نشطة', isActive: false }]);
  admin = await User.create({ fullName: 'مسؤول إدارة المياه', phone: '0597511111', passwordHash, role: 'admin' });
  citizen = await User.create({ fullName: 'مواطن اختبار الإدارة', phone: '0597522222', passwordHash, zoneId: zones[0]._id });
  otherCitizen = await User.create({ fullName: 'مواطن حارة ثانية', phone: '0597533333', passwordHash, zoneId: zones[1]._id });
  signed = await signIn(admin, 'admin/login'); resident = await signIn(citizen, 'auth/login');
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

test('all council reads and writes require current server-side admin authorization', async () => {
  const round = await create();
  const guestAgent = request.agent(app);
  const guest = { agent: guestAgent, csrf: (await guestAgent.get('/api/auth/me')).body.data.csrfToken };
  for (const [session, status] of [[guest, 401], [resident, 403]]) {
    for (const path of ['water', 'water-rounds']) await session.agent.get('/api/admin/' + path).set('X-Role', 'admin').expect(status);
    await write(session, 'water-rounds', values()).expect(status);
    await write(session, 'water-rounds/' + round.id, { ...values(), revision: 0 }, 'patch').expect(status);
    for (const action of ['publish', 'start', 'end', 'cancel']) await write(session, `water-rounds/${round.id}/${action}`, { revision: 0 }).expect(status);
  }
  await User.updateOne({ _id: admin._id }, { $set: { role: 'resident', zoneId: zones[0]._id } });
  await change(round, 'publish', 403);
  await User.updateOne({ _id: admin._id }, { $set: { role: 'admin', status: 'disabled' } });
  await signed.agent.get('/api/admin/water').expect(401);
  assert.equal((await stored(round.id)).publishedAt, null);
});

test('every write retains CSRF, exact Origin and JSON protections', async () => {
  const round = await create();
  const paths = ['water-rounds', ...['publish', 'start', 'end', 'cancel'].map((action) => `water-rounds/${round.id}/${action}`)];
  for (const path of paths) {
    await signed.agent.post('/api/admin/' + path).set('Origin', origin).send({ revision: 0 }).expect(403);
    await signed.agent.post('/api/admin/' + path).set('Origin', 'https://attacker.example').set('X-CSRF-Token', signed.csrf).send({ revision: 0 }).expect(403);
  }
  await signed.agent.patch('/api/admin/water-rounds/' + round.id).set('Origin', origin).send({ revision: 0 }).expect(403);
  await signed.agent.patch('/api/admin/water-rounds/' + round.id).set('Origin', 'https://attacker.example').set('X-CSRF-Token', signed.csrf).send({ revision: 0 }).expect(403);
  await signed.agent.post('/api/admin/water-rounds').set('Origin', origin).set('X-CSRF-Token', signed.csrf).type('form').send('x=y').expect(415);
});

test('creation saves a private draft with server identity and accepts an absent optional time', async () => {
  const before = Date.now();
  const input = values(); delete input.scheduledTime;
  const response = await write(signed, 'water-rounds', input).expect(201);
  const round = response.body.data.round;
  assert.equal(round.status, 'scheduled'); assert.equal(round.scheduledTime, null); assert.equal(round.publishedAt, null);
  const record = await stored(round.id);
  assert.equal(String(record.createdBy), String(admin._id));
  assert.equal(record.audit[0].action, 'created'); assert.ok(record.audit[0].at.getTime() >= before);
  assert.equal(record.notificationEvents, undefined);
  assert.deepEqual((await resident.agent.get('/api/water-rounds?month=' + month)).body.data.rounds, []);
  assert.deepEqual((await resident.agent.get('/api/home/summary')).body.data.upcomingRounds, []);
  privateMetadataAbsent(response.body);
});

test('dates, optional clocks, existing active zones, body types and untrusted fields are validated', async () => {
  const invalids = [
    { scheduledDate: '2026-02-29' }, { scheduledDate: '2028-02-30' }, { scheduledDate: '2026-2-01' }, { scheduledDate: '1899-12-31' }, { scheduledDate: {} },
    { scheduledTime: '24:00' }, { scheduledTime: '9:00' }, { scheduledTime: '12:60' }, { scheduledTime: 900 },
    { zoneId: String(zones[2]._id) }, { zoneId: String(new mongoose.Types.ObjectId()) }, { zoneId: { $ne: null } },
    { requestId: 'bad' }, { status: 'pumping' }, { publishedAt: new Date().toISOString() }, { actualStartedAt: new Date().toISOString() }, { createdBy: String(citizen._id) }, { revision: 0 },
  ];
  for (const value of invalids) await write(signed, 'water-rounds', values(value)).expect(422);
  await write(signed, 'water-rounds', []).expect(422);
  const leap = await create({ scheduledDate: '2028-02-29', scheduledTime: '00:00' });
  assert.equal(leap.scheduledTime, '00:00');
  const unspecified = await create({ scheduledTime: '' }); assert.equal(unspecified.scheduledTime, null);
  assert.equal(await WaterRound.countDocuments(), 2);
});

test('concurrent creation retries are idempotent and request reuse with different values conflicts', async () => {
  const input = values();
  const responses = await Promise.all([write(signed, 'water-rounds', input), write(signed, 'water-rounds', input)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 201]);
  assert.equal(responses[0].body.data.round.id, responses[1].body.data.round.id);
  await write(signed, 'water-rounds', { ...input, scheduledTime: '10:00' }).expect(409);
  assert.equal(await WaterRound.countDocuments(), 1);
  const record = await stored(responses[0].body.data.round.id); assert.equal(record.audit.length, 1);
});

test('publication is atomic, uses the server timestamp, and emits exactly one durable event intent', async () => {
  const round = await create(); const before = Date.now();
  const results = await Promise.all([write(signed, `water-rounds/${round.id}/publish`, { revision: 0 }), write(signed, `water-rounds/${round.id}/publish`, { revision: 0 })]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const record = await stored(round.id);
  assert.ok(record.publishedAt.getTime() >= before); assert.equal(String(record.publishedBy), String(admin._id));
  assert.equal(record.status, 'scheduled'); assert.equal(record.actualStartedAt, null);
  assert.equal(record.notificationEvents.length, 1); assert.equal(record.notificationEvents[0].type, 'schedule_published');
  assert.equal(record.notificationEvents[0].key, `water-round:${round.id}:schedule_published`);
  assert.equal(record.audit.filter((event) => event.action === 'published').length, 1);
  const visible = (await resident.agent.get('/api/water-rounds?month=' + month)).body.data.rounds;
  assert.deepEqual(visible.map((item) => item.id), [round.id]); privateMetadataAbsent(visible);
});

test('draft and published scheduled edits are versioned; publication and target neighborhood remain stable', async () => {
  const draft = await create();
  const input = { zoneId: String(zones[1]._id), scheduledDate: '2095-06-16', scheduledTime: '14:30', revision: 0 };
  const edited = (await write(signed, 'water-rounds/' + draft.id, input, 'patch').expect(200)).body.data.round;
  assert.equal(edited.zone.id, String(zones[1]._id)); assert.equal(edited.revision, 1);
  await write(signed, 'water-rounds/' + draft.id, input, 'patch').expect(409);
  const official = (await change(edited, 'publish')).body.data.round;
  const updated = (await write(signed, 'water-rounds/' + official.id, { ...input, revision: official.revision, scheduledTime: null }, 'patch').expect(200)).body.data.round;
  assert.equal(updated.publishedAt, official.publishedAt);
  await write(signed, 'water-rounds/' + official.id, { ...input, revision: updated.revision, zoneId: String(zones[0]._id) }, 'patch').expect(422);
  assert.equal((await stored(draft.id)).notificationEvents.length, 1);
});

test('starting requires a published scheduled round and ignores clock-based assumptions', async () => {
  const draft = await create(); await change(draft, 'start', 409);
  const official = (await change(draft, 'publish')).body.data.round;
  const before = Date.now();
  const pumping = (await change(official, 'start')).body.data.round;
  assert.equal(pumping.status, 'pumping'); assert.ok(new Date(pumping.actualStartedAt).getTime() >= before);
  const record = await stored(draft.id);
  assert.equal(String(record.actualStartedBy), String(admin._id)); assert.equal(record.actualEndedAt, null);
  assert.deepEqual(record.notificationEvents.map((event) => event.type), ['schedule_published', 'pumping_started']);
  await change(pumping, 'start', 409); await change(pumping, 'publish', 409); await change(pumping, 'cancel', 409);
  await write(signed, 'water-rounds/' + pumping.id, { revision: pumping.revision, zoneId: String(zones[0]._id), scheduledDate: date }, 'patch').expect(409);
  assert.equal((await stored(draft.id)).notificationEvents.length, 2);
});

test('concurrent start requests and stale edit-vs-start requests cannot overwrite a transition', async () => {
  const official = await published();
  const started = await Promise.all([write(signed, `water-rounds/${official.id}/start`, { revision: official.revision }), write(signed, `water-rounds/${official.id}/start`, { revision: official.revision })]);
  assert.deepEqual(started.map((response) => response.status).sort(), [200, 409]);
  await write(signed, 'water-rounds/' + official.id, { revision: official.revision, zoneId: String(zones[0]._id), scheduledDate: date, scheduledTime: '09:00' }, 'patch').expect(409);
  const record = await stored(official.id); assert.equal(record.notificationEvents.filter((event) => event.type === 'pumping_started').length, 1);
  assert.equal(record.audit.filter((event) => event.action === 'pumping_started').length, 1);
});

test('multiple zones pump independently; completing one changes Home and preserves the other', async () => {
  const first = await published(); const second = await published({ zoneId: String(zones[1]._id) });
  const pumping = (await change(first, 'start')).body.data.round;
  await change(second, 'start');
  let home = (await resident.agent.get('/api/home/summary')).body.data;
  assert.equal(home.activeRounds.length, 2); assert.equal(home.myNextRound, null);
  const ended = (await change(pumping, 'end')).body.data.round;
  assert.equal(ended.status, 'completed'); assert.ok(new Date(ended.actualEndedAt) >= new Date(ended.actualStartedAt));
  const record = await stored(first.id); assert.equal(String(record.actualEndedBy), String(admin._id)); assert.equal(record.notificationEvents.length, 2);
  home = (await resident.agent.get('/api/home/summary')).body.data;
  assert.deepEqual(home.activeRounds.map((round) => round.id), [second.id]); privateMetadataAbsent(home.activeRounds);
  const schedule = (await resident.agent.get('/api/water-rounds?month=' + month + '&zone=all')).body.data;
  assert.equal(schedule.rounds.some((round) => round.id === first.id), false);
  assert.deepEqual(schedule.activeRounds.map((round) => round.id), [second.id]);
  const water = (await signed.agent.get('/api/admin/water')).body.data;
  assert.equal(water.activeRounds.length, 1); assert.equal(water.history[0].id, first.id);
  await change(ended, 'end', 409); await change(ended, 'start', 409);
});

test('each citizen next-round query uses their registered zone, including refreshed publication and cancellation', async () => {
  const first = await published(); const second = await published({ zoneId: String(zones[1]._id) });
  const other = await signIn(otherCitizen, 'auth/login');
  assert.equal((await resident.agent.get('/api/home/summary')).body.data.myNextRound.id, first.id);
  assert.equal((await other.agent.get('/api/home/summary')).body.data.myNextRound.id, second.id);
  const cancelled = (await change(first, 'cancel')).body.data.round;
  assert.equal(cancelled.status, 'cancelled'); assert.ok(cancelled.cancelledAt);
  assert.equal((await resident.agent.get('/api/home/summary')).body.data.myNextRound, null);
  assert.deepEqual((await resident.agent.get('/api/water-rounds?month=' + month + '&zone=mine')).body.data.rounds, []);
  const history = (await signed.agent.get('/api/admin/water-rounds?month=' + month)).body.data.rounds;
  assert.equal(history.find((round) => round.id === first.id).status, 'cancelled');
  await change(cancelled, 'publish', 409); await change(cancelled, 'start', 409); await change(cancelled, 'cancel', 409);
  assert.equal((await stored(first.id)).notificationEvents.length, 1);
});

test('cancelled drafts remain private and invalid end or impersonation requests have no side effects', async () => {
  const draft = await create(); await change(draft, 'end', 409);
  for (const body of [{ revision: 0, adminId: String(citizen._id) }, { revision: 0, actualStartedAt: new Date().toISOString() }, { revision: '0' }, { revision: -1 }, { revision: 1.5 }, {}, { revision: null }]) await write(signed, `water-rounds/${draft.id}/publish`, body).expect(422);
  const cancelled = (await change(draft, 'cancel')).body.data.round;
  const record = await stored(draft.id); assert.equal(record.notificationEvents, undefined); assert.equal(String(record.cancelledBy), String(admin._id));
  assert.deepEqual((await resident.agent.get('/api/water-rounds?month=' + month)).body.data.rounds, []);
  await change(cancelled, 'end', 409);
  await write(signed, 'water-rounds/not-an-id/start', { revision: 0 }).expect(422);
  await write(signed, `water-rounds/${new mongoose.Types.ObjectId()}/start`, { revision: 0 }).expect(404);
});

test('legacy rounds without revision/audit metadata work without backfill and future-publication rules remain intact', async () => {
  const legacy = await WaterRound.collection.insertOne({ zoneId: zones[0]._id, scheduledDate: date, scheduledTime: null, status: 'scheduled', publishedAt: new Date('2026-01-01'), actualStartedAt: null, actualEndedAt: null });
  const response = await write(signed, `water-rounds/${legacy.insertedId}/start`, { revision: 0 }).expect(200);
  assert.equal(response.body.data.round.revision, 1);
  const future = await WaterRound.create({ zoneId: zones[0]._id, scheduledDate: date, publishedAt: new Date('9999-12-31T12:00:00Z') });
  await write(signed, `water-rounds/${future._id}/start`, { revision: 0 }).expect(409);
  await change(response.body.data.round, 'end');
  const round = await published(); await Zone.updateOne({ _id: zones[0]._id }, { $set: { isActive: false } });
  await change(round, 'start', 422);
});

test('admin list filters and pagination include drafts/history but never expose internal metadata', async () => {
  await WaterRound.insertMany(Array.from({ length: 53 }, (_, index) => ({ zoneId: zones[index % 2]._id, scheduledDate: date })));
  const first = (await signed.agent.get(`/api/admin/water-rounds?month=${month}&publication=draft`)).body.data;
  const second = (await signed.agent.get(`/api/admin/water-rounds?month=${month}&publication=draft&page=2`)).body.data;
  assert.equal(first.pagination.total, 53); assert.equal(first.rounds.length, 50); assert.equal(second.rounds.length, 3);
  assert.equal(new Set([...first.rounds, ...second.rounds].map((round) => round.id)).size, 53);
  assert.equal(first.timeZone, 'Asia/Hebron'); privateMetadataAbsent(first);
  for (const query of ['month=2026-13', 'month=2026-2', 'month=2026-02&month=2026-03', 'zone=bad', 'status=x', 'publication=x', 'page=0', 'page=100000', 'adminId=x']) await signed.agent.get('/api/admin/water-rounds?' + query).expect(422);
  for (const query of ['scheduledPage=0', 'historyPage=1.5', 'historyPage=1&historyPage=2', 'role=admin']) await signed.agent.get('/api/admin/water?' + query).expect(422);
  const official = await published(); await change(official, 'start');
  const noStore = await signed.agent.get('/api/admin/water').expect(200); assert.equal(noStore.headers['cache-control'], 'no-store'); privateMetadataAbsent(noStore.body);
});
