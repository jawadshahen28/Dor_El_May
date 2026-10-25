import mongoose from 'mongoose';
import { WaterRound } from '../models/WaterRound.js';
import { CitizenNotification } from '../models/CitizenNotification.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/response.js';
import { palestineDateTime, nextCalendarDate } from '@door-el-may/shared/water-time';

const eligibleResident = { $and: [{ $or: [{ status: 'active' }, { status: { $exists: false } }] }, { $or: [{ role: 'resident' }, { role: { $exists: false } }] }] };
const invalid = () => { throw new ApiError(422, 'INBOX_INVALID', 'طلب إشعارات غير صالح.'); };
const pageSize = 20;
export function inboxContent(record, now = new Date()) {
  if (record.type === 'pumping_started') return { title: 'بدأ ضخ المياه 💧', body: `أعلن مجلس قروي تلفيت بدء ضخ المياه في ${record.zoneName}.`, url: '/home' };
  const tomorrow = nextCalendarDate(palestineDateTime(now).date);
  return { title: 'موعد دور المياه 💧', body: record.scheduledDate === tomorrow
    ? `غدًا دور المياه في ${record.zoneName}.` : `دور المياه في ${record.zoneName} بتاريخ ${record.scheduledDate.replaceAll('-', '/')}.`, url: '/schedule' };
}

// Durable cursor + unique upserts recover a partial/crashed fan-out. This service
// never imports/calls push delivery or writes its events, subscriptions or ledger.
export async function persistEventInbox(roundId, key, { deadline = Date.now() + 3000, batchSize = 100 } = {}) {
  await CitizenNotification.init();
  let inserted = 0;
  while (Date.now() < deadline) {
    const round = await WaterRound.findById(roundId).select('+notificationEvents').lean();
    const event = round?.notificationEvents?.find((item) => item.key === key);
    if (event?.inbox?.version !== 1 || event.inbox.done) break;
    const expected = `water-round:${roundId}:${event.type}`;
    if (!['schedule_published', 'pumping_started'].includes(event.type) || key !== expected) break;
    const cursor = event.inbox.cursor || null;
    const users = await User.find({ ...eligibleResident, zoneId: event.zoneId,
      ...(cursor ? { _id: { $gt: cursor } } : {}),
      $or: [{ createdAt: { $lte: event.occurredAt } }, { createdAt: { $exists: false } }],
    }).select('_id').sort({ _id: 1 }).limit(batchSize).lean();
    if (users.length) {
      try {
        const result = await CitizenNotification.bulkWrite(users.map((user) => ({ updateOne: {
          filter: { userId: user._id, eventKey: key }, update: { $setOnInsert: {
            userId: user._id, eventKey: key, type: event.type, zoneName: event.inbox.zoneName,
            scheduledDate: event.inbox.scheduledDate, occurredAt: event.occurredAt, readAt: null,
          } }, upsert: true,
        } })), { ordered: false });
        inserted += result.upsertedCount;
      } catch (error) {
        // Concurrent workers may win the same insert; any other error leaves
        // the cursor untouched so all missing rows can be repaired later.
        if (!error.writeErrors?.length || error.writeErrors.some((item) => item.code !== 11000) || error.writeConcernErrors?.length) throw error;
      }
    }
    const done = users.length < batchSize;
    const updated = await WaterRound.updateOne({ _id: roundId,
      notificationEvents: { $elemMatch: { key, 'inbox.version': 1, 'inbox.done': false, 'inbox.cursor': cursor } },
    }, { $set: { 'notificationEvents.$.inbox.cursor': users.at(-1)?._id || cursor, 'notificationEvents.$.inbox.done': done } }, { timestamps: false });
    if (done && updated.modifiedCount) break;
  }
  return inserted;
}

export async function processInboxBatch({ roundId, zoneId, budgetMs = 3000 } = {}) {
  const deadline = Date.now() + budgetMs;
  const rows = await WaterRound.aggregate([
    { $match: { ...(roundId ? { _id: new mongoose.Types.ObjectId(String(roundId)) } : {}),
      notificationEvents: { $elemMatch: { 'inbox.version': 1, 'inbox.done': false, ...(zoneId ? { zoneId: new mongoose.Types.ObjectId(String(zoneId)) } : {}) } } } },
    { $unwind: '$notificationEvents' },
    { $match: { 'notificationEvents.inbox.version': 1, 'notificationEvents.inbox.done': false,
      ...(zoneId ? { 'notificationEvents.zoneId': new mongoose.Types.ObjectId(String(zoneId)) } : {}) } },
    { $sort: { 'notificationEvents.occurredAt': 1, _id: 1 } }, { $limit: 20 }, { $project: { 'notificationEvents.key': 1 } },
  ]).option({ maxTimeMS: 3000 });
  let inserted = 0;
  for (const row of rows) {
    if (Date.now() >= deadline) break;
    inserted += await persistEventInbox(row._id, row.notificationEvents.key, { deadline });
  }
  return { inserted };
}

const dto = (record, now) => ({ id: String(record._id), type: record.type, ...inboxContent(record, now),
  occurredAt: record.occurredAt, scheduledDate: record.scheduledDate, readAt: record.readAt || null });
function exact(value, keys = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) invalid();
}
function decodeCursor(value) {
  if (typeof value !== 'string' || value.length > 180 || !/^[\w-]+$/.test(value)) invalid();
  let result;
  try { result = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); } catch { invalid(); }
  exact(result, ['at', 'id']);
  if (typeof result.at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(result.at)
    || !Number.isFinite(+new Date(result.at)) || typeof result.id !== 'string' || !/^[a-f\d]{24}$/.test(result.id)) invalid();
  return { at: new Date(result.at), id: new mongoose.Types.ObjectId(result.id) };
}
export async function unreadInboxCount(userId) { return CitizenNotification.countDocuments({ userId, readAt: null }); }
export async function getInbox(user, query, { now = new Date() } = {}) {
  exact(query, ['before']);
  const before = query.before === undefined ? null : decodeCursor(query.before);
  // Repairs only newly opted-in durable intents; never historical experimental events.
  if (user.zoneId) await processInboxBatch({ zoneId: user.zoneId._id || user.zoneId, budgetMs: 1000 });
  const records = await CitizenNotification.find({ userId: user._id,
    ...(before ? { $or: [{ occurredAt: { $lt: before.at } }, { occurredAt: before.at, _id: { $lt: before.id } }] } : {}),
  }).sort({ occurredAt: -1, _id: -1 }).limit(pageSize + 1).lean();
  const hasMore = records.length > pageSize, page = records.slice(0, pageSize), last = page.at(-1);
  return { notifications: page.map((record) => dto(record, now)), unreadCount: await unreadInboxCount(user._id), generatedAt: now,
    nextCursor: hasMore ? Buffer.from(JSON.stringify({ at: last.occurredAt.toISOString(), id: String(last._id) })).toString('base64url') : null };
}
export async function markInboxRead(userId, id, body, now = new Date()) {
  exact(body);
  if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) throw new ApiError(404, 'NOT_FOUND', 'الإشعار غير موجود.');
  const record = await CitizenNotification.findOneAndUpdate({ _id: id, userId, readAt: null }, { $set: { readAt: now } }, { new: true }).lean()
    || await CitizenNotification.findOne({ _id: id, userId }).lean();
  if (!record) throw new ApiError(404, 'NOT_FOUND', 'الإشعار غير موجود.');
  return { notification: dto(record, now), unreadCount: await unreadInboxCount(userId) };
}
export async function markAllInboxRead(userId, body, now = new Date()) {
  exact(body);
  await CitizenNotification.updateMany({ userId, readAt: null, createdAt: { $lte: now } }, { $set: { readAt: now } });
  return { readAt: now, unreadCount: await unreadInboxCount(userId) };
}
