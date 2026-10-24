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
import { Announcement } from '../../src/models/Announcement.js';
import { getHomeSummary } from '../../src/services/homeSummary.js';

// Official-looking records below are disposable test fixtures only. Never use Atlas.
const origin = 'http://localhost:5173';
const now = new Date('2026-01-02T22:30:00Z'); // Jan 3, 00:30 in Asia/Hebron.
const publication = new Date('2026-01-01T12:00:00Z');
let mongo, app, zones, user, otherUser, agent, csrf;

before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { downloadDir: fileURLToPath(new URL('../../../.cache/mongodb', import.meta.url)) } });
  const connection = await connectDatabase(mongo.getUri('isolated_citizen_home_test'));
  await Promise.all([User.init(), Zone.init(), WaterRound.init(), Announcement.init()]);
  zones = await Zone.insertMany(['حارة المستخدم', 'حارة أخرى', 'حارة ثالثة', 'حارة رابعة'].map((name) => ({ name })));
  const passwordHash = await hashPassword('HomeFixture9!');
  user = await User.create({ fullName: 'مواطن اختبار', phone: '0596123456', passwordHash, zoneId: zones[0]._id });
  otherUser = await User.create({ fullName: 'مواطن آخر', phone: '0566123456', passwordHash, zoneId: zones[1]._id });
  user = await User.findById(user._id).populate('zoneId', 'name');
  const config = loadConfig({ SESSION_SECRET: 'citizen-home-tests-only-secret-at-least-32-characters', APP_ORIGINS: origin });
  const store = MongoStore.create({ client: connection.getClient(), collectionName: 'sessions' });
  store.on('error', () => {});
  app = createApp({ config, store, limits: await createRateLimits(connection), isDatabaseAvailable: databaseAvailable });
  agent = request.agent(app);
  const initial = await agent.get('/api/auth/me').expect(200);
  const login = await agent.post('/api/auth/login').set('Origin', origin).set('X-CSRF-Token', initial.body.data.csrfToken).send({ phone: user.phone, password: 'HomeFixture9!' }).expect(200);
  csrf = login.body.data.csrfToken;
});
beforeEach(async () => { await Promise.all([WaterRound.deleteMany({}), Announcement.deleteMany({})]); });
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

const round = (values = {}) => WaterRound.create({ zoneId: zones[0]._id, scheduledDate: '2026-01-03', scheduledTime: '09:00', publishedAt: publication, ...values });

test('summary requires the server session and ignores client-supplied user and zone IDs', async () => {
  await request(app).get(`/api/home/summary?userId=${user._id}`).expect(401);
  const response = await agent.get(`/api/home/summary?userId=${otherUser._id}&zoneId=${zones[1]._id}`).expect(200);
  assert.equal(response.body.data.user.id, String(user._id));
  assert.equal(response.body.data.zone.id, String(zones[0]._id));
  assert.equal(response.body.data.user.fullName, 'مواطن اختبار');
  assert.ok(!JSON.stringify(response.body).includes('passwordHash'));
  assert.equal(response.headers['cache-control'], 'no-store');
  await agent.post('/api/home/summary').set('Origin', origin).set('X-CSRF-Token', csrf).send({ status: 'pumping' }).expect(404);
});

test('empty collections return real empty states without creating schedules or announcements', async () => {
  const response = await agent.get('/api/home/summary').expect(200);
  const data = response.body.data;
  assert.deepEqual(data.activeRounds, []);
  assert.deepEqual(data.upcomingRounds, []);
  assert.equal(data.myNextRound, null);
  assert.equal(data.latestAnnouncement, null);
  assert.equal(data.waterLastUpdatedAt, null);
  assert.equal(data.timeZone, 'Asia/Hebron');
  assert.equal(await WaterRound.countDocuments(), 0);
  assert.equal(await Announcement.countDocuments(), 0);
});

test('multiple explicitly pumping published zones are shown; clocks never start pumping automatically', async () => {
  const pumping = await round({ status: 'pumping', actualStartedAt: new Date('2026-01-02T22:00:00Z') });
  await round({ zoneId: zones[1]._id, status: 'pumping', actualStartedAt: null });
  await round({ zoneId: zones[2]._id, status: 'pumping', publishedAt: null });
  await round({ zoneId: zones[3]._id, status: 'pumping', publishedAt: new Date('2026-01-04T12:00:00Z') });
  const overdue = await round({ zoneId: zones[2]._id, scheduledTime: '00:10', status: 'scheduled' });
  await round({ status: 'completed' });
  await round({ status: 'cancelled' });
  const summary = await getHomeSummary(user, { now });
  assert.equal(summary.activeRounds.length, 2);
  assert.ok(summary.activeRounds.some((item) => item.id === String(pumping._id) && item.actualStartedAt));
  assert.ok(summary.activeRounds.some((item) => item.actualStartedAt === null));
  assert.equal(summary.upcomingRounds.length, 0);
  assert.equal((await WaterRound.findById(overdue._id)).status, 'scheduled');
});

test('next own-zone round is independent of the three-round preview and uses the Palestine day', async () => {
  const mine = await round();
  const next = [];
  for (const [i, time] of ['00:40', '00:50', '01:00'].entries()) next.push(await round({ zoneId: zones[i + 1]._id, scheduledTime: time }));
  await round({ zoneId: new mongoose.Types.ObjectId(), scheduledTime: '00:35' }); // Deleted reference cannot consume a preview slot.
  await round({ scheduledDate: '2026-01-02', scheduledTime: '23:50' }); // Yesterday in Palestine, even though UTC says Jan 2.
  await round({ scheduledTime: '00:10' });
  await round({ scheduledTime: '00:31', publishedAt: null });
  const summary = await getHomeSummary(user, { now });
  assert.equal(summary.myNextRound.id, String(mine._id));
  assert.deepEqual(summary.upcomingRounds.map((item) => item.id), next.map((item) => String(item._id)));
  assert.ok(!summary.upcomingRounds.some((item) => item.zone.id === String(zones[0]._id)));
});

test('unknown scheduled times remain null, and later dates can be returned without inventing hours', async () => {
  const unspecific = await round({ scheduledTime: null });
  await round({ zoneId: zones[1]._id, scheduledDate: '2026-01-04', scheduledTime: '08:30' });
  const summary = await getHomeSummary(user, { now });
  assert.equal(summary.myNextRound.id, String(unspecific._id));
  assert.equal(summary.myNextRound.scheduledTime, null);
  assert.equal(summary.upcomingRounds.length, 2);
  const noZone = await getHomeSummary({ ...user.toObject(), zoneId: null }, { now });
  assert.equal(noZone.myNextRound, null);
  assert.equal(noZone.zone, null);
});

test('only the latest already-published announcement is returned', async () => {
  await Announcement.create({ title: 'مسودة اختبار', content: 'لا تظهر للمواطنين', status: 'draft', publishedAt: publication });
  await Announcement.create({ title: 'إعلان مستقبلي للاختبار', content: 'لا يظهر قبل نشره', status: 'published', publishedAt: new Date('2026-01-05T00:00:00Z') });
  await Announcement.create({ title: 'إعلان دون تاريخ نشر', content: 'لا يظهر', status: 'published' });
  await Announcement.create({ title: 'إعلان اختبار أقدم', content: 'قديم', status: 'published', publishedAt: publication });
  const latest = await Announcement.create({ title: 'آخر إعلان للاختبار', content: '<script>test text only</script>', status: 'published', publishedAt: new Date('2026-01-02T20:00:00Z') });
  const summary = await getHomeSummary(user, { now });
  assert.equal(summary.latestAnnouncement.id, String(latest._id));
  assert.equal(summary.latestAnnouncement.content, latest.content); // Plain text; the frontend never renders HTML.
});

test('water round models reject impossible calendar dates, invalid clocks, and unsupported statuses', async () => {
  for (const values of [{ scheduledDate: '2026-02-30' }, { scheduledTime: '24:00' }, { status: 'active' }]) {
    await assert.rejects(round(values), { name: 'ValidationError' });
  }
});
