import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createECDH } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import MongoStore from 'connect-mongo';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import webpush from 'web-push';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import { loadPushConfig } from '../../src/config/push.js';
import { connectDatabase, databaseAvailable } from '../../src/config/database.js';
import { createRateLimits } from '../../src/middleware/rateLimits.js';
import { hashPassword } from '../../src/utils/password.js';
import { User } from '../../src/models/User.js';
import { Zone } from '../../src/models/Zone.js';
import { WaterRound } from '../../src/models/WaterRound.js';
import { Announcement } from '../../src/models/Announcement.js';
import { PushSubscription } from '../../src/models/PushSubscription.js';
import { PushEvent, PushDelivery, PushWorkerState } from '../../src/models/PushDelivery.js';
import { processPushBatch, announcementNotificationIntent } from '../../src/services/pushProcessor.js';
import { createCouncilRound, changeCouncilRound } from '../../src/services/councilWater.js';
import { decryptSubscription } from '../../src/services/pushSubscriptions.js';

// Disposable database, ephemeral keys and mocked transport ONLY. Never read local .env values or call a push provider.
const databaseName = 'isolated_push_staging_test', origin = 'http://localhost:5173', password = 'PushFixtureOnly9!';
const keys = webpush.generateVAPIDKeys(), storageKey = randomBytes(32).toString('base64url');
const pushSource = { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: 'mailto:tests@example.invalid', PUSH_SUBSCRIPTION_KEY: storageKey };
let mongo, app, config, zones, users, admin, sessions, now, calls, workerConfig;
const token = () => randomBytes(32).toString('hex');
function subscription() { const pair = createECDH('prime256v1'); pair.generateKeys(); return { endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic-' + randomUUID(), keys: { auth: randomBytes(16).toString('base64url'), p256dh: pair.getPublicKey().toString('base64url') } }; }
async function signIn(user, route = 'auth/login', agent = request.agent(app)) {
  const initial = (await agent.get('/api/auth/me')).body.data;
  const response = await agent.post('/api/' + route).set('Origin', origin).set('X-CSRF-Token', initial.csrfToken).send({ phone: user.phone, password }).expect(200);
  return { agent, csrf: response.body.data.csrfToken };
}
const write = (signed, data, method = 'post', path = '/api/notifications/subscription') => signed.agent[method](path).set('Origin', origin).set('X-CSRF-Token', signed.csrf).send(data);
async function optIn(index = 0, deviceToken = token(), input = subscription()) {
  const response = await write(sessions[index], { deviceToken, subscription: input }).expect(200);
  return { deviceToken, input, binding: response.body.data.binding };
}
const batch = (transport = async (sub, payload) => { calls.push({ sub, payload }); return { statusCode: 201 }; }) => processPushBatch({ config: workerConfig, sessionSecret: config.sessionSecret, transport, clock: () => new Date(now) });
async function arm() { const result = await batch(); assert.equal(result.armed, true); now += 1000; }
async function publish(zone = zones[0]) {
  const created = await createCouncilRound(admin, { zoneId: String(zone._id), scheduledDate: '2095-01-01', requestId: randomUUID() }, { now: new Date(now) });
  return (await changeCouncilRound(admin, created.round.id, 'publish', { revision: 0 }, { now: new Date(now) })).round;
}

before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { downloadDir: fileURLToPath(new URL('../../../.cache/mongodb', import.meta.url)) } });
  const connection = await connectDatabase(mongo.getUri(databaseName));
  await Promise.all([User.init(), Zone.init(), WaterRound.init(), Announcement.init(), PushSubscription.init(), PushEvent.init(), PushDelivery.init(), PushWorkerState.init()]);
  config = loadConfig({ SESSION_SECRET: 'isolated-push-session-secret-at-least-32-characters', APP_ORIGINS: origin, ...pushSource });
  const store = MongoStore.create({ client: connection.getClient(), collectionName: 'sessions' }); store.on('error', () => {});
  app = createApp({ config, store, limits: await createRateLimits(connection), isDatabaseAvailable: databaseAvailable });
});
beforeEach(async () => {
  await Promise.all([User, Zone, WaterRound, Announcement, PushSubscription, PushEvent, PushDelivery, PushWorkerState].map((model) => model.deleteMany({})));
  await mongoose.connection.db.collection('auth_rate_limits').deleteMany({});
  const passwordHash = await hashPassword(password);
  zones = await Zone.insertMany([{ name: 'حارة إشعارات أولى' }, { name: 'حارة إشعارات ثانية' }]);
  users = await User.insertMany(['0597611111', '0597622222', '0597633333'].map((phone, index) => ({ fullName: 'مواطن اختبار الإشعارات', phone, passwordHash, zoneId: zones[index === 1 ? 1 : 0]._id })));
  admin = await User.create({ fullName: 'مسؤول اختبار الإشعارات', phone: '0597644444', passwordHash, role: 'admin' });
  sessions = await Promise.all(users.map((user) => signIn(user)));
  now = Date.now() + 100; calls = [];
  workerConfig = loadPushConfig({ ...pushSource, PUSH_OUTBOUND_ENABLED: 'true', PUSH_STAGING_CONFIRMED: 'true', PUSH_STAGING_DATABASE: databaseName,
    PUSH_TEST_USER_IDS: users.slice(0, 2).map((user) => String(user._id)).join(','), PUSH_DELIVERY_NOT_BEFORE: new Date(now).toISOString() });
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

test('notification routes require authenticated residents, valid CSRF and trusted Origin', async () => {
  for (const path of ['config', 'subscription']) await request(app).get('/api/notifications/' + path).expect(401);
  const staff = await signIn(admin, 'admin/login');
  for (const path of ['config', 'subscription']) await staff.agent.get('/api/notifications/' + path).expect(403);
  await write(staff, { deviceToken: token(), subscription: subscription() }).expect(403);
  await sessions[0].agent.post('/api/notifications/subscription').send({}).expect(403);
  await sessions[0].agent.post('/api/notifications/subscription').set('Origin', 'https://evil.example').set('X-CSRF-Token', sessions[0].csrf).send({}).expect(403);
  const state = await sessions[0].agent.get('/api/notifications/config').expect(200);
  assert.equal(state.body.data.outboundEnabled, false); assert.equal(state.body.data.publicKey, keys.publicKey);
  assert.ok(!JSON.stringify(state.body).includes(keys.privateKey)); assert.ok(!JSON.stringify(state.body).includes(storageKey));
  assert.equal(state.headers['cache-control'], 'no-store');
});
test('subscriptions are encrypted at rest and APIs return only device status and an opaque binding', async () => {
  const saved = await optIn();
  const record = await PushSubscription.findOne().select('+encrypted +installationHash +sessionHash').lean();
  assert.ok(!JSON.stringify(record).includes(saved.input.endpoint)); assert.ok(!JSON.stringify(record).includes(saved.input.keys.auth));
  assert.deepEqual(decryptSubscription(record, storageKey).keys, saved.input.keys);
  const response = await sessions[0].agent.get('/api/notifications/subscription').set('X-Push-Device', saved.deviceToken).expect(200);
  assert.deepEqual(response.body.data, { active: true, binding: saved.binding });
  const other = await sessions[1].agent.get('/api/notifications/subscription').set('X-Push-Device', saved.deviceToken).expect(200); assert.equal(other.body.data.active, false);
  await write(sessions[1], { deviceToken: saved.deviceToken }, 'delete').expect(200); assert.equal((await PushSubscription.findOne()).active, true);
});
test('validation blocks user identity injection, invalid encryption keys, unknown fields and SSRF endpoints', async () => {
  const input = subscription();
  for (const changes of [{ userId: String(users[1]._id) }, { zoneId: String(zones[1]._id) }, { deviceToken: 'bad' }, { subscription: { ...input, endpoint: 'https://127.0.0.1/x' } }, { subscription: { ...input, keys: { ...input.keys, auth: 'short' } } }, { subscription: { ...input, unknown: true } }]) await write(sessions[0], { deviceToken: token(), subscription: input, ...changes }).expect(422);
  await sessions[0].agent.get('/api/notifications/subscription?deviceToken=x').expect(422);
  assert.equal(await PushSubscription.countDocuments(), 0);
});
test('registration retries retain consent/binding and a second installation cannot steal an endpoint', async () => {
  const saved = await optIn(), before = await PushSubscription.findOne().lean();
  const again = await write(sessions[0], { deviceToken: saved.deviceToken, subscription: saved.input }).expect(200);
  assert.equal(again.body.data.binding, saved.binding); assert.equal(+(await PushSubscription.findOne()).consentAt, +before.consentAt);
  await write(sessions[1], { deviceToken: token(), subscription: saved.input }).expect(409);
  assert.equal(await PushSubscription.countDocuments(), 1);
});
test('opt-out and logout revoke current-session devices while another device session stays active', async () => {
  const first = await optIn();
  const separate = await signIn(users[0]);
  const secondDevice = token(); await write(separate, { deviceToken: secondDevice, subscription: subscription() }).expect(200);
  await write(sessions[0], { deviceToken: first.deviceToken }, 'delete').expect(200);
  assert.equal(await PushSubscription.countDocuments({ active: true }), 1);
  await write(separate, {}, 'post', '/api/auth/logout').expect(200);
  assert.equal(await PushSubscription.countDocuments({ active: true }), 0);
});
test('successful account switch revokes the old binding and requires explicit new-account opt-in', async () => {
  const saved = await optIn();
  const switched = await signIn(users[1], 'auth/login', sessions[0].agent);
  assert.equal((await PushSubscription.findOne()).active, false);
  const enabled = await write(switched, { deviceToken: saved.deviceToken, subscription: saved.input }).expect(200);
  assert.notEqual(enabled.body.data.binding, saved.binding);
  assert.equal(String((await PushSubscription.findOne()).userId), String(users[1]._id));
});
test('disabled sending does not project events; first enabled run arms without replaying history', async () => {
  await optIn(); await publish();
  const off = await processPushBatch({ config: config.push, transport: () => { throw new Error('Must not call.'); } }); assert.equal(off.enabled, false);
  assert.equal(await PushEvent.countDocuments(), 0);
  now += 1000; await arm(); await batch(); assert.equal(calls.length, 0); assert.equal(await PushEvent.countDocuments(), 0);
  await assert.rejects(processPushBatch({ config: { ...workerConfig, databaseName: 'different_staging_db' }, transport: () => {} }));
});
test('published schedules use existing durable events and target only opted-in allowlisted residents in that zone', async () => {
  await Promise.all([optIn(0), optIn(1), optIn(2)]); await arm(); const round = await publish();
  const result = await batch(); assert.equal(result.sent, 1); assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.type, 'schedule_published');
  for (const privateValue of [users[0].phone, users[0].fullName, String(users[0]._id), zones[0].name, String(zones[0]._id)]) assert.ok(!JSON.stringify(calls[0].payload).includes(privateValue));
  assert.equal((await WaterRound.findById(round.id).select('+notificationEvents')).notificationEvents.length, 1);
  await batch(); assert.equal(calls.length, 1); assert.equal(await PushEvent.countDocuments(), 1); assert.equal(await PushDelivery.countDocuments(), 1);
});
test('drafts and edits emit nothing; start emits once and completion emits no event', async () => {
  await optIn(); await arm();
  const draft = (await createCouncilRound(admin, { zoneId: String(zones[0]._id), scheduledDate: '2095-01-01', requestId: randomUUID() })).round;
  await batch(); assert.equal(calls.length, 0);
  let round = (await changeCouncilRound(admin, draft.id, 'publish', { revision: 0 }, { now: new Date(now) })).round;
  await batch(); assert.equal(calls.length, 1);
  round = (await changeCouncilRound(admin, round.id, 'edit', { revision: round.revision, zoneId: String(zones[0]._id), scheduledDate: '2095-01-02' })).round;
  await batch(); assert.equal(calls.length, 1);
  now += 100; round = (await changeCouncilRound(admin, round.id, 'start', { revision: round.revision }, { now: new Date(now) })).round;
  await batch(); assert.equal(calls.length, 2); assert.equal(calls[1].payload.type, 'pumping_started');
  await changeCouncilRound(admin, round.id, 'end', { revision: round.revision }, { now: new Date(now + 100) });
  await batch(); assert.equal(calls.length, 2);
});
test('concurrent workers share leases and the delivery ledger prevents duplicate sends', async () => {
  await optIn(); await arm(); await publish(); await Promise.all([batch(), batch()]);
  assert.equal(calls.length, 1); assert.equal(await PushDelivery.countDocuments(), 1);
});
test('transient provider failures retry durably with backoff and Retry-After', async () => {
  await optIn(); await arm(); await publish();
  const failed = await batch(async () => ({ statusCode: 429, retryAfter: '120' })); assert.equal(failed.retried, 1);
  const delivery = await PushDelivery.findOne(); assert.equal(delivery.status, 'retry'); assert.ok(+delivery.nextAttemptAt >= now + 120000);
  await batch(); assert.equal(calls.length, 0);
  now += 121000; const recovered = await batch(); assert.equal(recovered.sent, 1); assert.equal(calls.length, 1);
  assert.equal((await PushDelivery.findOne()).attempts, 2);
});
test('terminal 410 deactivates expired subscriptions, while VAPID failures do not erase subscriptions', async () => {
  await optIn(); await arm(); await publish();
  await batch(async () => ({ statusCode: 403 })); assert.equal((await PushSubscription.findOne()).active, true);
  now += 16 * 60000;
  await batch(async () => ({ statusCode: 410 })); assert.equal((await PushSubscription.findOne()).active, false);
  assert.equal((await PushDelivery.findOne()).lastCode, 'subscription_expired');
});
test('revoked, disabled, moved-neighborhood and expired-session recipients are rechecked before retries', async () => {
  await optIn(); await arm(); await publish(); await batch(async () => ({ statusCode: 503 }));
  await User.updateOne({ _id: users[0]._id }, { $set: { zoneId: zones[1]._id } }); now += 120000;
  await batch(); assert.equal(calls.length, 0); assert.equal((await PushDelivery.findOne()).status, 'skipped');
  await PushEvent.deleteMany({}); await PushDelivery.deleteMany({}); await WaterRound.deleteMany({});
  await User.updateOne({ _id: users[0]._id }, { $set: { zoneId: zones[0]._id } }); await publish();
  await mongoose.connection.db.collection('sessions').deleteMany({});
  await batch(); assert.equal(calls.length, 0); assert.equal((await PushDelivery.findOne()).lastCode, 'session_or_owner');
});
test('cancelled/ended source state and subscriptions created after an event never trigger stale alerts', async () => {
  const saved = await optIn(); await arm(); const round = await publish();
  await changeCouncilRound(admin, round.id, 'cancel', { revision: round.revision }); await batch(); assert.equal(calls.length, 0);
  now += 100; await publish(); await PushSubscription.updateMany({}, { $set: { consentAt: new Date(now + 1) } });
  await batch(); assert.equal(calls.length, 0);
});
test('future announcement publication integration fans out village-wide only through an explicit durable intent', async () => {
  await Promise.all([optIn(0), optIn(1), optIn(2)]); await arm();
  const announcement = await Announcement.create({ title: 'اختبار إعلان رسمي', content: 'نص رسمي تجريبي' });
  await batch(); assert.equal(calls.length, 0);
  await Announcement.findOneAndUpdate({ _id: announcement._id, status: 'draft', publishedAt: null }, {
    $set: { status: 'published', publishedAt: new Date(now) }, $push: { notificationEvents: announcementNotificationIntent(announcement._id, new Date(now)) },
  });
  await batch(); assert.equal(calls.length, 2); assert.ok(calls.every((call) => call.payload.type === 'announcement_published' && call.payload.sourceId === String(announcement._id)));
  await batch(); assert.equal(calls.length, 2);
});
