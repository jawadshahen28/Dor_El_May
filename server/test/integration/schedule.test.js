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
import { WaterRound } from '../../src/models/WaterRound.js';
import { getWaterSchedule, scheduleFilters } from '../../src/services/waterSchedule.js';

// Disposable MongoDB only. Never read developer .env or write official schedules.
const origin = 'http://localhost:5173';
const now = new Date('2026-01-31T22:30:00Z'); // Already February in Palestine.
const publication = new Date('2026-01-01T12:00:00Z');
let mongo, app, zones, user, agent, csrf;
before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { downloadDir: fileURLToPath(new URL('../../../.cache/mongodb', import.meta.url)) } });
  const connection = await connectDatabase(mongo.getUri('isolated_water_schedule_test'));
  await Promise.all([User.init(), Zone.init(), WaterRound.init()]);
  zones = await Zone.insertMany(['حارة الحساب للاختبار', 'حارة أخرى للاختبار'].map((name) => ({ name })));
  user = await User.create({ fullName: 'مواطن اختبار الجدول', phone: '0596876543', passwordHash: await hashPassword('ScheduleFixture9!'), zoneId: zones[0]._id });
  user = await User.findById(user._id).populate('zoneId', 'name');
  const config = loadConfig({ SESSION_SECRET: 'schedule-tests-only-secret-at-least-32-characters', APP_ORIGINS: origin });
  const store = MongoStore.create({ client: connection.getClient(), collectionName: 'sessions' });
  store.on('error', () => {});
  app = createApp({ config, store, limits: await createRateLimits(connection), isDatabaseAvailable: databaseAvailable });
  agent = request.agent(app);
  const initial = await agent.get('/api/auth/me').expect(200);
  const login = await agent.post('/api/auth/login').set('Origin', origin).set('X-CSRF-Token', initial.body.data.csrfToken).send({ phone: user.phone, password: 'ScheduleFixture9!' }).expect(200);
  csrf = login.body.data.csrfToken;
});
beforeEach(async () => { await WaterRound.deleteMany({}); });
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });
const round = (values = {}) => WaterRound.create({ zoneId: zones[0]._id, scheduledDate: '2026-02-01', scheduledTime: '09:00', publishedAt: publication, ...values });
const schedule = (query = {}) => getWaterSchedule(user, query, { now });

test('full schedule requires a real session for every filter and has no write routes', async () => {
  for (const query of ['', '?zone=mine', '?month=2026-02', '?status=pumping']) await request(app).get(`/api/water-rounds${query}`).expect(401);
  const response = await agent.get('/api/water-rounds?month=2026-02').expect(200);
  assert.deepEqual(response.body.data.rounds, []);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.ok(!JSON.stringify(response.body).includes('passwordHash'));
  await agent.post('/api/water-rounds').set('Origin', origin).set('X-CSRF-Token', csrf).send({ status: 'pumping' }).expect(404);
  assert.equal(await WaterRound.countDocuments(), 0);
});

test('only published entries with valid zone references are exposed, in chronological order', async () => {
  const later = await round({ scheduledDate: '2026-02-20' });
  const earlier = await round({ scheduledDate: '2026-02-02', scheduledTime: null });
  const sameDay = await round({ scheduledDate: '2026-02-02', scheduledTime: '15:00' });
  await round({ publishedAt: null });
  await round({ publishedAt: new Date('2099-01-01T00:00:00Z') });
  await round({ zoneId: new mongoose.Types.ObjectId() });
  await round({ scheduledDate: '2026-01-31' });
  await round({ scheduledDate: '2026-03-01' });
  const result = await schedule({ month: '2026-02' });
  assert.deepEqual(result.rounds.map((item) => item.id), [earlier, sameDay, later].map((item) => String(item._id)));
  assert.equal(result.pagination.total, 3);
  assert.equal(result.rounds[0].scheduledTime, null);
  assert.ok(result.rounds.every((item) => !('zoneId' in item) && !('__v' in item)));
});

test('mine uses the server user zone, explicit zone filtering works, and missing own zone never means all', async () => {
  const mine = await round({ scheduledDate: '2095-02-01' });
  const other = await round({ zoneId: zones[1]._id, scheduledDate: '2095-02-01' });
  const ownResponse = await agent.get('/api/water-rounds?month=2095-02').expect(200);
  assert.equal(ownResponse.body.data.zone, 'mine');
  assert.deepEqual(ownResponse.body.data.rounds.map((item) => item.id), [String(mine._id)]);
  const allResponse = await agent.get('/api/water-rounds?month=2095-02&zone=all').expect(200);
  assert.equal(allResponse.body.data.rounds.length, 2);
  const otherResponse = await agent.get(`/api/water-rounds?month=2095-02&zone=${zones[1]._id}`).expect(200);
  assert.deepEqual(otherResponse.body.data.rounds.map((item) => item.id), [String(other._id)]);
  await agent.get(`/api/water-rounds?zone=mine&userId=${new mongoose.Types.ObjectId()}`).expect(422);
  const missing = await getWaterSchedule({ zoneId: null }, { month: '2026-02', zone: 'mine' }, { now });
  assert.deepEqual(missing.rounds, []);
  assert.deepEqual(missing.activeRounds, []);
  assert.equal(missing.pagination.total, 0);
});

test('completed/cancelled records are excluded from citizen queries without changing stored status or the real pumping timestamp', async () => {
  for (const status of ['scheduled', 'pumping', 'completed', 'cancelled']) await round({ status, actualStartedAt: status === 'pumping' ? publication : null });
  const result = await schedule({ month: '2026-02' });
  assert.deepEqual(result.rounds.map((item) => item.status), ['scheduled']);
  assert.deepEqual(result.activeRounds.map((item) => item.status), ['pumping']);
  assert.equal(+result.activeRounds[0].actualStartedAt, +publication);
  for (const status of ['completed', 'cancelled']) {
    await agent.get(`/api/water-rounds?month=2026-02&status=${status}`).expect(422);
    assert.equal(await WaterRound.countDocuments({ status }), 1);
  }
  assert.equal(await WaterRound.countDocuments({ status: 'scheduled' }), 1);
  assert.equal(await WaterRound.countDocuments(), 4);
});

test('Palestine month defaults, leap days, and December/January boundaries use calendar dates', async () => {
  assert.equal(scheduleFilters({}, user, now).month, '2026-02');
  const leap = await round({ scheduledDate: '2028-02-29' });
  await round({ scheduledDate: '2028-03-01' });
  const leapResponse = await schedule({ month: '2028-02' });
  assert.deepEqual(leapResponse.rounds.map((item) => item.id), [String(leap._id)]);
  const december = await round({ scheduledDate: '2026-12-31' });
  const january = await round({ scheduledDate: '2027-01-01' });
  for (const [month, expected] of [['2026-12', december], ['2027-01', january]]) {
    const response = await schedule({ month });
    assert.deepEqual(response.rounds.map((item) => item.id), [String(expected._id)]);
  }
});

test('malformed, duplicate, injection-shaped and unknown query parameters are rejected', async () => {
  for (const query of ['month=2026-13', 'month=2026-2', 'month=1899-12', 'month=2026-02-01', 'month=', 'month=2026-02&month=2026-03', 'zone=bad', 'zone[$ne]=x', 'status=active', 'status=', 'page=0', 'page=-1', 'page=1.5', 'page=100000', 'page=1&page=2', 'from=2026-02-01']) {
    const response = await agent.get(`/api/water-rounds?${query}`).expect(422);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  }
});

test('monthly pagination returns every valid row without duplicates or silent truncation', async () => {
  await WaterRound.insertMany(Array.from({ length: 53 }, (_, index) => ({ zoneId: zones[index % 2]._id, scheduledDate: '2095-02-15', scheduledTime: '10:00', publishedAt: publication })));
  await round({ zoneId: new mongoose.Types.ObjectId(), scheduledDate: '2095-02-15' });
  const active = await round({ status: 'pumping', scheduledDate: '2020-01-01', actualStartedAt: publication });
  const first = (await agent.get('/api/water-rounds?month=2095-02&zone=all').expect(200)).body.data;
  const second = (await agent.get('/api/water-rounds?month=2095-02&zone=all&page=2').expect(200)).body.data;
  assert.equal(first.rounds.length, 50);
  assert.equal(first.pagination.total, 53);
  assert.equal(first.pagination.hasMore, true);
  assert.equal(second.rounds.length, 3);
  assert.equal(second.pagination.hasMore, false);
  assert.equal(new Set([...first.rounds, ...second.rounds].map((item) => item.id)).size, 53);
  for (const response of [first, second]) assert.deepEqual(response.activeRounds.map((item) => item.id), [String(active._id)]);
});

test('current pumping stays visible outside its planned month; only future published scheduled rows enter the monthly section', async () => {
  const active = await round({ status: 'pumping', scheduledDate: '2025-12-01', actualStartedAt: publication });
  const otherActive = await round({ zoneId: zones[1]._id, status: 'pumping', scheduledDate: '2020-01-01', actualStartedAt: publication });
  await round({ status: 'pumping', publishedAt: null });
  await round({ status: 'pumping', publishedAt: new Date('2099-01-01') });
  await round({ status: 'completed' }); await round({ status: 'cancelled' }); await round({ publishedAt: null });
  const later = await round({ scheduledDate: '2026-02-02' });
  const unknown = await round({ scheduledDate: '2026-02-01', scheduledTime: null });
  const boundary = await round({ scheduledDate: '2026-02-01', scheduledTime: '00:30' });
  await round({ scheduledDate: '2026-02-01', scheduledTime: '00:29' });
  await round({ scheduledDate: '2026-01-31' });
  const current = await schedule({ month: '2026-02' });
  assert.deepEqual(current.rounds.map((item) => item.id), [unknown, boundary, later].map((item) => String(item._id)));
  for (const month of ['2025-12', '2026-01', '2026-02', '2026-03']) {
    const result = await schedule({ month });
    assert.deepEqual(result.activeRounds.map((item) => item.id), [String(active._id)]);
    if (month !== '2026-02') assert.deepEqual(result.rounds, []);
  }
  const all = await schedule({ month: '2026-03', zone: 'all' });
  assert.deepEqual(all.activeRounds.map((item) => item.id), [String(active._id), String(otherActive._id)]);
  assert.deepEqual((await schedule({ status: 'scheduled' })).activeRounds, []);
  assert.deepEqual((await schedule({ status: 'pumping' })).rounds, []);
  assert.equal(await WaterRound.countDocuments({ status: 'scheduled', scheduledTime: '00:29' }), 1);
});
