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
import { CitizenNotification } from '../../src/models/CitizenNotification.js';
import { PushEvent, PushDelivery } from '../../src/models/PushDelivery.js';
import { PushSubscription } from '../../src/models/PushSubscription.js';
import { createCouncilRound, changeCouncilRound } from '../../src/services/councilWater.js';
import { processInboxBatch, persistEventInbox, inboxContent, getInbox } from '../../src/services/notificationInbox.js';

const origin = 'http://localhost:5173', password = 'InboxFixtureOnly9!';
let mongo, app, admin, users, zones, sessions, staff;
const models = [User, Zone, WaterRound, CitizenNotification, PushEvent, PushDelivery, PushSubscription];
async function signIn(user, route = '/api/auth/login') {
  const agent = request.agent(app), initial = (await agent.get('/api/auth/me')).body.data;
  const result = await agent.post(route).set('Origin', origin).set('X-CSRF-Token', initial.csrfToken).send({ phone: user.phone, password }).expect(200);
  return { agent, csrf: result.body.data.csrfToken };
}
const write = (signed, path, body = {}) => signed.agent.post(path).set('Origin', origin).set('X-CSRF-Token', signed.csrf).send(body);
async function publish(zone = zones[0], options = {}) {
  const round = (await createCouncilRound(admin, { zoneId: String(zone._id), scheduledDate: '2095-01-01', requestId: randomUUID() })).round;
  return (await changeCouncilRound(admin, round.id, 'publish', { revision: 0 }, options)).round;
}
before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { downloadDir: fileURLToPath(new URL('../../../.cache/mongodb', import.meta.url)) } });
  const uri = mongo.getUri('isolated_notification_inbox_test'); assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:/);
  const connection = await connectDatabase(uri); await Promise.all(models.map((model) => model.init()));
  const config = loadConfig({ SESSION_SECRET: 'isolated-inbox-session-secret-at-least-32-characters', APP_ORIGINS: origin });
  const store = MongoStore.create({ client: connection.getClient(), collectionName: 'sessions' }); store.on('error', () => {});
  app = createApp({ config, store, limits: await createRateLimits(connection), isDatabaseAvailable: databaseAvailable });
});
beforeEach(async () => {
  await Promise.all(models.map((model) => model.deleteMany({}))); await mongoose.connection.db.collection('auth_rate_limits').deleteMany({});
  const passwordHash = await hashPassword(password);
  zones = await Zone.insertMany([{ name: 'الحارة الوسطى' }, { name: 'الحارة الغربية' }]);
  users = await User.insertMany(['0597111111', '0597122222', '0597133333'].map((phone, index) => ({ fullName: 'مواطن صندوق اختبار', phone, passwordHash, zoneId: zones[index === 2 ? 1 : 0]._id })));
  admin = await User.create({ fullName: 'مسؤول صندوق اختبار', phone: '0597144444', passwordHash, role: 'admin' });
  sessions = await Promise.all(users.map((user) => signIn(user))); staff = await signIn(admin, '/api/admin/login');
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

test('publication and start persist once per active resident in the actual zone without any device subscription or push ledger writes', async () => {
  await User.updateOne({ _id: users[1]._id }, { $set: { status: 'disabled' } });
  const round = await publish(); assert.equal(await CitizenNotification.countDocuments(), 1);
  assert.equal(await PushSubscription.countDocuments(), 0); assert.equal(await PushEvent.countDocuments(), 0); assert.equal(await PushDelivery.countDocuments(), 0);
  const record = await CitizenNotification.findOne().lean(); assert.equal(String(record.userId), String(users[0]._id)); assert.equal(record.zoneName, zones[0].name);
  const started = (await changeCouncilRound(admin, round.id, 'start', { revision: round.revision })).round;
  assert.equal(await CitizenNotification.countDocuments(), 2);
  await processInboxBatch(); await processInboxBatch(); assert.equal(await CitizenNotification.countDocuments(), 2);
  await changeCouncilRound(admin, round.id, 'end', { revision: started.revision }); assert.equal(await CitizenNotification.countDocuments(), 2);
  assert.equal(await CitizenNotification.countDocuments({ userId: users[2]._id }), 0);
});
test('inbox history and read status persist across logout, new login and a second device; every response is private and no-store', async () => {
  await publish(); const first = await sessions[0].agent.get('/api/notifications/inbox').expect(200);
  assert.equal(first.headers['cache-control'], 'no-store'); assert.equal(first.body.data.unreadCount, 1);
  assert.doesNotMatch(JSON.stringify(first.body), /eventKey|userId|password|encrypted|endpoint|sessionHash|zoneId/);
  const id = first.body.data.notifications[0].id;
  await write(sessions[0], `/api/notifications/inbox/${id}/read`).expect(200);
  const readAt = (await CitizenNotification.findById(id)).readAt;
  await write(sessions[0], '/api/auth/logout').expect(200);
  sessions[0] = await signIn(users[0]); const secondDevice = await signIn(users[0]);
  for (const signed of [sessions[0], secondDevice]) {
    const response = await signed.agent.get('/api/notifications/inbox').expect(200);
    assert.equal(response.body.data.unreadCount, 0); assert.equal(response.body.data.notifications[0].id, id); assert.equal(+new Date(response.body.data.notifications[0].readAt), +readAt);
  }
});
test('read and mark-all are idempotent, account-scoped, and retain CSRF, Origin and strict-body checks', async () => {
  const round = await publish(); await changeCouncilRound(admin, round.id, 'start', { revision: round.revision });
  const id = String((await CitizenNotification.findOne({ userId: users[0]._id }))._id);
  const first = await write(sessions[0], `/api/notifications/inbox/${id}/read`).expect(200); assert.equal(first.body.data.unreadCount, 1);
  const again = await write(sessions[0], `/api/notifications/inbox/${id}/read`).expect(200); assert.equal(again.body.data.notification.readAt, first.body.data.notification.readAt);
  await write(sessions[1], `/api/notifications/inbox/${id}/read`).expect(404);
  await sessions[0].agent.post('/api/notifications/read-all').set('Origin', origin).send({}).expect(403);
  await sessions[0].agent.post('/api/notifications/read-all').set('Origin', 'https://evil.example').set('X-CSRF-Token', sessions[0].csrf).send({}).expect(403);
  await write(sessions[0], '/api/notifications/read-all', { userId: String(users[1]._id) }).expect(422);
  const all = await write(sessions[0], '/api/notifications/read-all').expect(200); assert.equal(all.body.data.unreadCount, 0);
  await write(sessions[0], '/api/notifications/read-all').expect(200);
  assert.equal((await sessions[1].agent.get('/api/notifications/unread-count')).body.data.unreadCount, 2);
});
test('inbox rejects guests, administrators, malformed cursors and identity injection without disclosing other accounts', async () => {
  await publish();
  for (const path of ['/api/notifications/inbox', '/api/notifications/unread-count']) {
    await request(app).get(path).expect(401); await staff.agent.get(path).expect(403);
    await sessions[0].agent.get(path + '?userId=' + users[1]._id).expect(422);
  }
  for (const query of ['before=bad', 'before=x&before=y', 'limit=999', 'before[$ne]=x']) await sessions[0].agent.get('/api/notifications/inbox?' + query).expect(422);
  await write(sessions[0], '/api/notifications/inbox/not-an-id/read').expect(404);
});
test('cursor pagination is stable with tied event timestamps and preserves older history without a TTL', async () => {
  const at = new Date('2020-01-01T00:00:00Z');
  await CitizenNotification.insertMany(Array.from({ length: 45 }, (_, index) => ({ userId: users[0]._id, eventKey: `fixture:${index}`, type: 'schedule_published', zoneName: zones[0].name, scheduledDate: '2020-01-02', occurredAt: at })));
  const ids = []; let before;
  do {
    const response = await sessions[0].agent.get('/api/notifications/inbox' + (before ? '?before=' + before : '')).expect(200);
    ids.push(...response.body.data.notifications.map((item) => item.id)); before = response.body.data.nextCursor;
  } while (before);
  assert.equal(ids.length, 45); assert.equal(new Set(ids).size, 45);
  const indexes = await CitizenNotification.collection.indexes(); assert.ok(indexes.every((index) => index.expireAfterSeconds === undefined));
});
test('only newly marked official events are materialized; snapshots survive later schedule/zone changes and late registration is excluded', async () => {
  const round = await publish();
  const before = await CitizenNotification.findOne({ userId: users[0]._id }).lean();
  await Zone.updateOne({ _id: zones[0]._id }, { $set: { name: 'اسم حارة جديد' } });
  await WaterRound.updateOne({ _id: round.id }, { $set: { scheduledDate: '2095-02-01' } });
  assert.equal((await CitizenNotification.findById(before._id)).scheduledDate, '2095-01-01');
  const legacy = await WaterRound.create({ zoneId: zones[0]._id, scheduledDate: '2020-01-01', publishedAt: new Date(), notificationEvents: [{ key: 'legacy', type: 'schedule_published', zoneId: zones[0]._id, occurredAt: new Date() }] });
  const count = await CitizenNotification.countDocuments(); await processInboxBatch(); assert.equal(await CitizenNotification.countDocuments(), count);
  assert.equal(await CitizenNotification.countDocuments({ eventKey: 'legacy' }), 0); assert.ok(legacy);
});
test('interrupted fan-out is repaired concurrently without overwriting read state or touching push delivery', async () => {
  const round = await publish(), key = `water-round:${round.id}:schedule_published`;
  const first = await CitizenNotification.findOne({ userId: users[0]._id }); first.readAt = new Date(); await first.save();
  await CitizenNotification.deleteOne({ userId: users[1]._id });
  await WaterRound.updateOne({ _id: round.id }, { $set: { 'notificationEvents.0.inbox.cursor': null, 'notificationEvents.0.inbox.done': false } });
  const afterEvent = new Date(Date.now() + 60000);
  await User.create({ fullName: 'مواطن بعد الحدث', phone: '0597155555', zoneId: zones[0]._id, passwordHash: 'unused', createdAt: afterEvent });
  await Promise.all([persistEventInbox(round.id, key, { batchSize: 1 }), persistEventInbox(round.id, key, { batchSize: 1 })]);
  assert.equal(await CitizenNotification.countDocuments(), 2); assert.ok((await CitizenNotification.findById(first._id)).readAt);
  assert.equal(await PushDelivery.countDocuments(), 0);
});
test('tomorrow wording uses the current Palestine calendar, while history shows the actual scheduled date accurately', async () => {
  const sample = { type: 'schedule_published', zoneName: 'الحارة الوسطى', scheduledDate: '2026-01-03' };
  assert.equal(inboxContent(sample, new Date('2026-01-01T23:30:00Z')).body, 'غدًا دور المياه في الحارة الوسطى.');
  assert.doesNotMatch(inboxContent(sample, new Date('2026-01-03T10:00:00Z')).body, /غدًا/);
  assert.match(inboxContent(sample, new Date('2026-03-01T10:00:00Z')).body, /2026\/01\/03/);
  assert.match(inboxContent({ ...sample, type: 'pumping_started' }).body, /الحارة الوسطى/);
});
