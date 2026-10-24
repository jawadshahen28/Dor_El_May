import { Announcement } from '../models/Announcement.js';
import { ApiError } from '../utils/response.js';
import { PALESTINE_TIME_ZONE } from '@door-el-may/shared/water-time';

const pageSize = 10;
const recentDays = 30;
const publishedFilter = (now) => ({ status: 'published', publishedAt: { $type: 'date', $lte: now } });
const unavailable = () => new ApiError(404, 'ANNOUNCEMENT_NOT_FOUND', 'الإعلان غير متاح أو لم يعد منشورًا.');

export async function listAnnouncements(query, { now = new Date() } = {}) {
  if (Object.entries(query).some(([key, value]) => !['view', 'page'].includes(key) || typeof value !== 'string')
    || (query.view !== undefined && !['all', 'recent'].includes(query.view))
    || (query.page !== undefined && !/^[1-9]\d{0,4}$/.test(query.page))) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'يرجى اختيار تصفية ورقم صفحة صالحين للإعلانات.');
  }
  const page = Number(query.page || 1);
  const view = query.view || 'all';
  const filter = publishedFilter(now);
  const since = new Date(now.getTime() - recentDays * 86400000);
  if (view === 'recent') filter.publishedAt.$gte = since;
  const [result] = await Announcement.aggregate([
    { $match: filter }, { $sort: { publishedAt: -1, _id: -1 } },
    { $facet: {
      rows: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }, { $project: {
        title: 1, publishedAt: 1, excerpt: { $substrCP: ['$content', 0, 320] },
      } }],
      count: [{ $count: 'total' }],
    } },
  ]);
  const total = result?.count[0]?.total || 0;
  return {
    announcements: (result?.rows || []).map((item) => ({
      id: String(item._id), title: item.title, excerpt: item.excerpt, publishedAt: item.publishedAt,
    })),
    pagination: { page, pageSize, total, hasMore: page * pageSize < total },
    view, recentDays, since: view === 'recent' ? since : null, generatedAt: now, timeZone: PALESTINE_TIME_ZONE,
  };
}

export async function getAnnouncement(id, { now = new Date() } = {}) {
  // Invalid, absent, draft and future-published IDs have the same public response.
  if (!/^[a-f\d]{24}$/i.test(id)) throw unavailable();
  const item = await Announcement.findOne({ _id: id, ...publishedFilter(now) }).select('title content publishedAt').lean();
  if (!item) throw unavailable();
  return {
    announcement: { id: String(item._id), title: item.title, content: item.content, publishedAt: item.publishedAt },
    timeZone: PALESTINE_TIME_ZONE,
  };
}
