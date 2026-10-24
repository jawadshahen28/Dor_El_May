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
import { Announcement } from '../../src/models/Announcement.js';
import { listAnnouncements, getAnnouncement } from '../../src/services/announcements.js';

// Disposable test data only; never load .env or write to the developer's Atlas.
const origin = 'http://localhost:5173';
const now = new Date('2026-01-31T22:30:00Z');
let mongo, app, agent, csrf;
before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { downloadDir: fileURLToPath(new URL('../../../.cache/mongodb', import.meta.url)) } });
  const connection = await connectDatabase(mongo.getUri('isolated_announcements_test'));
  await Promise.all([User.init(), Zone.init(), Announcement.init()]);
  const zone = await Zone.create({ name: 'حارة اختبار الإعلانات' });
  await User.create({ fullName: 'مواطن اختبار الإعلانات', phone: '0596898765', passwordHash: await hashPassword('AnnouncementFixture9!'), zoneId: zone._id });
  const config = loadConfig({ SESSION_SECRET: 'announcements-tests-only-secret-at-least-32-characters', APP_ORIGINS: origin });
  const store = MongoStore.create({ client: connection.getClient(), collectionName: 'sessions' });
  store.on('error', () => {});
  app = createApp({ config, store, limits: await createRateLimits(connection), isDatabaseAvailable: databaseAvailable });
  agent = request.agent(app);
  const initial = await agent.get('/api/auth/me').expect(200);
  const login = await agent.post('/api/auth/login').set('Origin', origin).set('X-CSRF-Token', initial.body.data.csrfToken).send({ phone: '0596898765', password: 'AnnouncementFixture9!' }).expect(200);
  csrf = login.body.data.csrfToken;
});
beforeEach(async () => { await Announcement.deleteMany({}); });
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });
const announcement = (values = {}) => Announcement.create({ title: 'إعلان اختبار معزول', content: 'نص اختبار للقراءة فقط.', status: 'published', publishedAt: new Date('2026-01-30T12:00:00Z'), ...values });

test('announcement browsing and direct IDs require a session; empty reads never create records', async () => {
  for (const path of ['/api/announcements', '/api/announcements?view=recent', '/api/announcements/100000000000000000000001', '/api/announcements/invalid']) await request(app).get(path).expect(401);
  const response = await agent.get('/api/announcements').expect(200);
  assert.deepEqual(response.body.data.announcements, []);
  assert.equal(response.body.data.pagination.total, 0);
  assert.equal(response.body.data.timeZone, 'Asia/Hebron');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(await Announcement.countDocuments(), 0);
});

test('only already-published announcements appear, with a small citizen-only projection', async () => {
  const visible = await announcement({ content: '💧'.repeat(400) });
  await announcement({ status: 'draft' });
  await announcement({ publishedAt: null });
  await announcement({ publishedAt: new Date('2099-01-01T00:00:00Z') });
  const response = await agent.get('/api/announcements').expect(200);
  const list = response.body.data.announcements;
  assert.equal(list.length, 1);
  assert.equal(list[0].id, String(visible._id));
  assert.deepEqual(Object.keys(list[0]).sort(), ['excerpt', 'id', 'publishedAt', 'title']);
  assert.equal(Array.from(list[0].excerpt).length, 320);
  assert.ok(!('important' in list[0]) && !('image' in list[0]));
});

test('details return complete plain text and identical 404s for invalid, absent, draft and future records', async () => {
  const content = 'فقرة أولى، بتوقيت فلسطين.\n\nفقرة ثانية <script>notExecutable()</script>\n' + 'نص كامل '.repeat(1000);
  const visible = await announcement({ content });
  const response = await agent.get(`/api/announcements/${visible._id}`).expect(200);
  assert.equal(response.body.data.announcement.content, visible.content);
  assert.deepEqual(Object.keys(response.body.data.announcement).sort(), ['content', 'id', 'publishedAt', 'title']);
  const draft = await announcement({ status: 'draft' });
  const future = await announcement({ publishedAt: new Date('2099-01-01T00:00:00Z') });
  const undated = await announcement({ publishedAt: null });
  let expected;
  for (const id of ['invalid', String(new mongoose.Types.ObjectId()), String(draft._id), String(future._id), String(undated._id)]) {
    const missing = await agent.get(`/api/announcements/${id}`).expect(404);
    expected ||= missing.body;
    assert.deepEqual(missing.body, expected);
    assert.equal(missing.body.error.code, 'ANNOUNCEMENT_NOT_FOUND');
  }
});

test('newest-first pagination returns all records once, including ties in publication time', async () => {
  const records = await Announcement.insertMany(Array.from({ length: 23 }, (_, index) => ({
    title: `اختبار دفعات ${index}`, content: 'سجل اختبار معزول.', status: 'published', publishedAt: new Date(index < 13 ? '2026-01-30T12:00:00Z' : '2026-01-29T12:00:00Z'),
  })));
  const expected = records.sort((a, b) => b.publishedAt - a.publishedAt || String(b._id).localeCompare(String(a._id))).map((item) => String(item._id));
  const ids = [];
  for (const page of [1, 2, 3]) {
    const response = await agent.get(`/api/announcements?page=${page}`).expect(200);
    assert.equal(response.body.data.pagination.total, 23);
    assert.equal(response.body.data.pagination.pageSize, 10);
    assert.equal(response.body.data.pagination.hasMore, page < 3);
    ids.push(...response.body.data.announcements.map((item) => item.id));
  }
  assert.deepEqual(ids, expected);
  assert.equal(new Set(ids).size, 23);
  const pastEnd = await agent.get('/api/announcements?page=4').expect(200);
  assert.deepEqual(pastEnd.body.data.announcements, []);
});

test('recent really filters the last 30 days without changing default newest-first browsing', async () => {
  const boundary = new Date(now.getTime() - 30 * 86400000);
  const included = await announcement({ publishedAt: boundary });
  const old = await announcement({ publishedAt: new Date(boundary.getTime() - 1) });
  const latest = await announcement({ publishedAt: now });
  await announcement({ publishedAt: new Date(now.getTime() + 1) });
  const recent = await listAnnouncements({ view: 'recent' }, { now });
  assert.deepEqual(recent.announcements.map((item) => item.id), [String(latest._id), String(included._id)]);
  assert.equal(recent.since.getTime(), boundary.getTime());
  assert.equal(recent.recentDays, 30);
  const all = await listAnnouncements({}, { now });
  assert.equal(all.announcements.length, 3);
  assert.equal(all.announcements.at(-1).id, String(old._id));
  const detail = await getAnnouncement(String(included._id), { now });
  assert.equal(detail.announcement.publishedAt.getTime(), boundary.getTime());
});

test('invalid, repeated, injection-shaped and unsupported list parameters are rejected', async () => {
  for (const query of ['view=', 'view=important', 'view=all&view=recent', 'view[$ne]=draft', 'status=draft', 'userId=other', 'page=0', 'page=-1', 'page=01', 'page=1.5', 'page=100000', 'page=1&page=2', 'limit=1000']) {
    const response = await agent.get(`/api/announcements?${query}`).expect(422);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  }
});

test('announcement write and administration operations are not available to citizens', async () => {
  const item = await announcement();
  for (const [method, path] of [['post', '/api/announcements'], ['patch', `/api/announcements/${item._id}`], ['delete', `/api/announcements/${item._id}`]]) {
    await agent[method](path).set('Origin', origin).set('X-CSRF-Token', csrf).send({ title: 'تعديل غير مسموح', status: 'published' }).expect(404);
  }
  assert.equal(await Announcement.countDocuments(), 1);
  assert.equal((await Announcement.findById(item._id)).title, item.title);
});
