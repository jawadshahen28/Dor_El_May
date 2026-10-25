import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { PushSubscription } from '../models/PushSubscription.js';
import { PushEvent, PushDelivery, PushWorkerState } from '../models/PushDelivery.js';
import { WaterRound } from '../models/WaterRound.js';
import { Announcement } from '../models/Announcement.js';
import { User } from '../models/User.js';
import { pushDatabaseAllowed } from '../config/push.js';
import { decryptSubscription, digest, pushSessionHash } from './pushSubscriptions.js';
import { sendWebPush } from './pushTransport.js';

const duration = (type) => type === 'pumping_started' ? 15 * 60000 : 3600000;
const activeResident = { $and: [{ $or: [{ status: 'active' }, { status: { $exists: false } }] }, { $or: [{ role: 'resident' }, { role: { $exists: false } }] }] };
export const announcementNotificationIntent = (id, now = new Date()) => ({ key: `announcement:${id}:published`, type: 'announcement_published', occurredAt: now });
async function sourceCurrent(event, now) {
  const source = event.type === 'announcement_published' ? Announcement : WaterRound;
  const record = await source.findById(event.sourceId).select('+notificationEvents').lean();
  if (!record || !record.publishedAt || record.publishedAt > now || !record.notificationEvents?.some((intent) => intent.key === event.key && intent.type === event.type && +intent.occurredAt === +event.occurredAt)) return false;
  if (event.type === 'announcement_published') return record.status === 'published';
  return String(record.zoneId) === String(event.zoneId) && (event.type === 'pumping_started' ? record.status === 'pumping' : ['scheduled', 'pumping'].includes(record.status));
}
async function projectEvents(config, cutoff, now, deadline) {
  let projected = 0;
  for (const [source, types] of [[WaterRound, ['schedule_published', 'pumping_started']], [Announcement, ['announcement_published']]]) {
    const fresh = { $gt: new Date(Math.max(+cutoff, +now - 3600000)), $lte: now };
    const rows = await source.aggregate([
      { $match: { 'notificationEvents.occurredAt': fresh } }, { $unwind: '$notificationEvents' },
      { $match: { 'notificationEvents.occurredAt': fresh, 'notificationEvents.type': { $in: types } } },
      { $lookup: { from: PushEvent.collection.name, localField: 'notificationEvents.key', foreignField: 'key', as: 'projected' } },
      { $match: { projected: { $size: 0 } } }, { $sort: { 'notificationEvents.occurredAt': 1, 'notificationEvents.key': 1 } },
      { $limit: 100 }, { $project: { notificationEvents: 1 } },
    ]).option({ maxTimeMS: 5000 });
    for (const row of rows) {
      if (Date.now() > deadline) break;
      const intent = row.notificationEvents, expiresAt = new Date(+intent.occurredAt + duration(intent.type));
      const expected = intent.type === 'announcement_published' ? `announcement:${row._id}:published` : `water-round:${row._id}:${intent.type}`;
      if (intent.key !== expected || expiresAt <= now || (intent.type !== 'announcement_published' && !intent.zoneId)) continue;
      const result = await PushEvent.updateOne({ key: intent.key }, { $setOnInsert: {
        key: intent.key, campaignId: config.campaignId, sourceId: row._id, type: intent.type, zoneId: intent.zoneId || null,
        occurredAt: intent.occurredAt, expiresAt, purgeAt: new Date(+expiresAt + 7 * 86400000),
      } }, { upsert: true });
      projected += result.upsertedCount;
    }
  }
  return projected;
}
export async function processPushBatch({ config, sessionSecret, transport = sendWebPush, clock = () => new Date() }) {
  const report = { enabled: false, armed: false, projected: 0, queued: 0, sent: 0, skipped: 0, retried: 0, failed: 0 };
  // No database reads, state creation, queues or transport calls while disabled.
  if (!config.enabled) return report;
  if (!config.configured || !config.confirmed || typeof sessionSecret !== 'string' || sessionSecret.length < 32 || mongoose.connection.name !== config.databaseName || !pushDatabaseAllowed(config.databaseName) || !Number.isFinite(+config.cutoff)) throw new Error('Push safety gate blocked processing.');
  report.enabled = true;
  await Promise.all([PushEvent.init(), PushDelivery.init(), PushWorkerState.init(), PushSubscription.init()]);
  const now = clock(), stateId = config.campaignId;
  const initial = await PushWorkerState.findOneAndUpdate({ _id: stateId }, { $setOnInsert: { activatedAt: now, leaseUntil: new Date(0) } }, { upsert: true, new: true, includeResultMetadata: true });
  // First explicit processing run arms a fresh campaign; it cannot replay pre-activation events.
  if (!initial.lastErrorObject.updatedExisting) { report.armed = true; return report; }
  const leaseToken = randomUUID(), deadline = Date.now() + 45000;
  const state = await PushWorkerState.findOneAndUpdate({ _id: stateId, leaseUntil: { $lte: now }, $or: [{ pausedUntil: null }, { pausedUntil: { $lte: now } }] }, { $set: { leaseUntil: new Date(+now + 90000), leaseToken } }, { new: true }).lean();
  if (!state) return report;
  try {
    const cutoff = new Date(Math.max(+state.activatedAt, +config.cutoff));
    await PushSubscription.updateMany({ active: true, $or: [{ expiresAt: { $type: 'date', $lte: now } }, { lastSeenAt: { $lt: new Date(+now - 45 * 86400000) } }] }, { $set: { active: false, purgeAt: new Date(+now + 30 * 86400000) } });
    await PushDelivery.updateMany({ campaignId: stateId, status: 'sending', attempts: { $gte: 5 }, leaseUntil: { $lte: now } }, { $set: { status: 'failed', lastCode: 'attempt_limit', leaseUntil: null, leaseToken: null } });
    report.projected = await projectEvents(config, cutoff, now, deadline);
    const events = await PushEvent.find({ campaignId: stateId, occurredAt: { $gt: cutoff }, expiresAt: { $gt: now }, fanoutDone: false }).sort({ occurredAt: 1, _id: 1 }).limit(20).lean();
    for (const event of events) {
      if (Date.now() > deadline) break;
      if (!await sourceCurrent(event, now)) { await PushEvent.updateOne({ _id: event._id }, { $set: { fanoutDone: true } }); continue; }
      const candidates = await PushSubscription.find({ active: true, ...(config.testUserIds.length ? { userId: { $in: config.testUserIds } } : {}), consentAt: { $lte: event.occurredAt }, keyVersion: config.keyVersion,
        ...(event.cursor ? { _id: { $gt: event.cursor } } : {}), $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }).select('+binding').sort({ _id: 1 }).limit(100).lean();
      for (const subscription of candidates) {
        if (Date.now() > deadline) break;
        const user = await User.exists({ _id: subscription.userId, ...activeResident, ...(event.zoneId ? { zoneId: event.zoneId } : {}) });
        if (user) {
          const result = await PushDelivery.updateOne({ eventId: event._id, subscriptionId: subscription._id }, { $setOnInsert: {
            campaignId: stateId, eventId: event._id, subscriptionId: subscription._id, binding: subscription.binding, nextAttemptAt: now, purgeAt: event.purgeAt,
          } }, { upsert: true }); report.queued += result.upsertedCount;
        }
        await PushEvent.updateOne({ _id: event._id }, { $set: { cursor: subscription._id } });
      }
      if (candidates.length < 100 && Date.now() <= deadline) await PushEvent.updateOne({ _id: event._id }, { $set: { fanoutDone: true } });
    }
    for (let count = 0; count < 20 && Date.now() < deadline; count++) {
      const at = clock();
      const delivery = await PushDelivery.findOneAndUpdate({ campaignId: stateId, attempts: { $lt: 5 },
        $or: [{ status: { $in: ['pending', 'retry'] }, nextAttemptAt: { $lte: at } }, { status: 'sending', leaseUntil: { $lte: at } }],
      }, { $set: { status: 'sending', leaseToken, leaseUntil: new Date(+at + 90000) }, $inc: { attempts: 1 } }, { new: true }).select('+binding').lean();
      if (!delivery) break;
      const finish = (values) => PushDelivery.updateOne({ _id: delivery._id, leaseToken, status: 'sending' }, { $set: { ...values, leaseUntil: null, leaseToken: null } });
      const [event, subscription] = await Promise.all([PushEvent.findById(delivery.eventId).lean(), PushSubscription.findById(delivery.subscriptionId).select('+binding +keyVersion +encrypted +installationHash +sessionHash').lean()]);
      if (!event || event.expiresAt <= at || !subscription?.active || subscription.binding !== delivery.binding || subscription.keyVersion !== config.keyVersion
        || (config.testUserIds.length && !config.testUserIds.includes(String(subscription.userId))) || subscription.consentAt > event.occurredAt || (subscription.expiresAt && subscription.expiresAt <= at) || !await sourceCurrent(event, at)) {
        await finish({ status: 'skipped', lastCode: 'ineligible' }); report.skipped++; continue;
      }
      const user = await User.findOne({ _id: subscription.userId, ...activeResident }).select('zoneId').lean();
      let secret;
      try { secret = decryptSubscription(subscription, config.encryptionKey); } catch { await finish({ status: 'failed', lastCode: 'storage_key' }); report.failed++; continue; }
      const session = await mongoose.connection.db.collection('sessions').findOne({ _id: secret.sessionId, expires: { $gt: at } });
      let sessionUser;
      try { sessionUser = JSON.parse(session?.session || '{}').userId; } catch {}
      if (!user || sessionUser !== String(subscription.userId) || pushSessionHash(secret.sessionId, sessionSecret) !== subscription.sessionHash) {
        await PushSubscription.updateOne({ _id: subscription._id, binding: delivery.binding }, { $set: { active: false, purgeAt: new Date(+at + 30 * 86400000) } });
        await finish({ status: 'skipped', lastCode: 'session_or_owner' }); report.skipped++; continue;
      }
      if (event.zoneId && String(user.zoneId) !== String(event.zoneId)) { await finish({ status: 'skipped', lastCode: 'neighborhood_changed' }); report.skipped++; continue; }
      let result;
      if (Date.now() >= deadline) {
        await PushDelivery.updateOne({ _id: delivery._id, leaseToken, status: 'sending' }, { $set: { status: 'retry', nextAttemptAt: at, leaseUntil: null, leaseToken: null, lastCode: 'run_budget' }, $inc: { attempts: -1 } });
        break;
      }
      try { result = await transport({ endpoint: secret.endpoint, keys: secret.keys }, { protocol: 1, type: event.type, eventId: digest(event.key), binding: delivery.binding, expiresAt: +event.expiresAt,
        ...(event.type === 'announcement_published' ? { sourceId: String(event.sourceId) } : {}) }, config, Math.floor((+event.expiresAt - +at) / 1000)); }
      catch { result = { statusCode: 0 }; }
      const status = result.statusCode;
      if (status >= 200 && status < 300) { await finish({ status: 'sent', sentAt: at, lastCode: null }); report.sent++; }
      else if ([404, 410].includes(status)) {
        await PushSubscription.updateOne({ _id: subscription._id, binding: delivery.binding }, { $set: { active: false, purgeAt: new Date(+at + 30 * 86400000) } });
        await finish({ status: 'failed', lastCode: 'subscription_expired' }); report.failed++;
      } else if ([401, 403].includes(status)) {
        await PushWorkerState.updateOne({ _id: stateId, leaseToken }, { $set: { pausedUntil: new Date(+at + 15 * 60000) } });
        await finish({ status: delivery.attempts >= 5 ? 'failed' : 'retry', lastCode: 'vapid_rejected', nextAttemptAt: new Date(+at + 15 * 60000) }); report.failed++; break;
      } else if ((status === 0 || status === 429 || status >= 500) && delivery.attempts < 5) {
        const retryHeader = /^\d+$/.test(String(result.retryAfter || '')) ? Number(result.retryAfter) * 1000 : Math.max(0, +new Date(result.retryAfter) - +at) || 0;
        const delay = Math.min(3600000, Math.max(30000 * 2 ** (delivery.attempts - 1) + Math.floor(Math.random() * 10000), retryHeader));
        await finish({ status: 'retry', lastCode: status ? 'provider_transient' : 'network', nextAttemptAt: new Date(+at + delay) }); report.retried++;
      } else { await finish({ status: 'failed', lastCode: 'provider_permanent' }); report.failed++; }
    }
    return report;
  } finally { await PushWorkerState.updateOne({ _id: stateId, leaseToken }, { $set: { leaseUntil: new Date(0), leaseToken: null } }); }
}
