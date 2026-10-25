import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { isCalendarDate, isLocalTime, palestineDateTime, PALESTINE_TIME_ZONE } from '@door-el-may/shared/water-time';
import { WaterRound } from '../models/WaterRound.js';
import { Zone } from '../models/Zone.js';
import { ApiError } from '../utils/response.js';
import { publishedRoundsFilter } from './waterRoundRead.js';

const pageSize = 50;
const invalid = (message = 'يرجى التحقق من بيانات الدور.', fields) => { throw new ApiError(422, 'VALIDATION_ERROR', message, fields); };
const conflict = () => { throw new ApiError(409, 'ROUND_CONFLICT', 'تغيّر الدور أو نُفّذ الإجراء مسبقًا. حدّث البيانات وراجع الحالة قبل المحاولة.'); };
const objectId = (value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
function exactKeys(value, allowed, required = allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => !allowed.includes(key)) || required.some((key) => !Object.hasOwn(value, key))) invalid();
}
function version(value) { if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) invalid(); return value; }
function scheduleValues(body) {
  const fields = {};
  if (!objectId(body.zoneId)) fields.zoneId = 'اختر حارة موجودة.';
  if (!isCalendarDate(body.scheduledDate) || Number(body.scheduledDate?.slice(0, 4)) < 1900) fields.scheduledDate = 'أدخل تاريخًا صحيحًا بين 1900 و9999.';
  const scheduledTime = body.scheduledTime === '' || body.scheduledTime == null ? null : body.scheduledTime;
  if (scheduledTime !== null && !isLocalTime(scheduledTime)) fields.scheduledTime = 'أدخل الساعة بصيغة HH:mm أو اتركها فارغة.';
  if (Object.keys(fields).length) invalid('يرجى التحقق من بيانات الدور.', fields);
  return { zoneId: body.zoneId.toLowerCase(), scheduledDate: body.scheduledDate, scheduledTime };
}
async function activeZone(id) {
  if (!await Zone.exists({ _id: id, isActive: true })) invalid('الحارة غير متاحة. اختر حارة نشطة من القائمة.', { zoneId: 'اختر حارة نشطة موجودة.' });
}
function adminDto(round) {
  return {
    id: String(round._id), zoneId: round.zoneId?._id ? String(round.zoneId._id) : null,
    zone: round.zoneId?.name ? { id: String(round.zoneId._id), name: round.zoneId.name, isActive: round.zoneId.isActive } : null,
    scheduledDate: round.scheduledDate, scheduledTime: round.scheduledTime || null, status: round.status,
    publishedAt: round.publishedAt || null, actualStartedAt: round.actualStartedAt || null, actualEndedAt: round.actualEndedAt || null,
    cancelledAt: round.cancelledAt || null, createdAt: round.createdAt, updatedAt: round.updatedAt,
    revision: round.revision || 0,
  };
}
const populated = (query) => query.populate('zoneId', 'name isActive').lean();
const responseRound = async (id) => adminDto(await populated(WaterRound.findById(id)));
const pagination = (page, total) => ({ page, pageSize, total, hasMore: page * pageSize < total });
function pageNumber(value) {
  if (value !== undefined && (typeof value !== 'string' || !/^[1-9]\d{0,4}$/.test(value))) invalid();
  return Number(value || 1);
}
export async function getCouncilSchedule(query, { now = new Date() } = {}) {
  exactKeys(query, ['month', 'zone', 'status', 'publication', 'page'], []);
  if (Object.values(query).some((value) => typeof value !== 'string')) invalid();
  const month = query.month ?? palestineDateTime(now).date.slice(0, 7);
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 1900) invalid();
  if (query.zone !== undefined && query.zone !== 'all' && !objectId(query.zone)) invalid();
  if (query.status !== undefined && !['all', 'scheduled', 'pumping', 'completed', 'cancelled'].includes(query.status)) invalid();
  if (query.publication !== undefined && !['all', 'draft', 'published'].includes(query.publication)) invalid();
  const page = pageNumber(query.page);
  const filter = {
    scheduledDate: { $gte: month + '-01', $lte: month + '-31' },
    ...(query.zone && query.zone !== 'all' ? { zoneId: new mongoose.Types.ObjectId(query.zone) } : {}),
    ...(query.status && query.status !== 'all' ? { status: query.status } : {}),
    ...(query.publication === 'draft' ? { publishedAt: null } : query.publication === 'published' ? publishedRoundsFilter(now) : {}),
  };
  const [rounds, total] = await Promise.all([
    populated(WaterRound.find(filter).sort({ scheduledDate: 1, scheduledTime: 1, _id: 1 }).skip((page - 1) * pageSize).limit(pageSize)),
    WaterRound.countDocuments(filter),
  ]);
  return { rounds: rounds.map(adminDto), month, pagination: pagination(page, total), generatedAt: now, timeZone: PALESTINE_TIME_ZONE };
}
export async function getCouncilWater(query, { now = new Date() } = {}) {
  exactKeys(query, ['scheduledPage', 'historyPage'], []);
  const scheduledPage = pageNumber(query.scheduledPage), historyPage = pageNumber(query.historyPage);
  const scheduled = { ...publishedRoundsFilter(now), status: 'scheduled' };
  const history = { status: { $in: ['completed', 'cancelled'] } };
  const [active, eligible, recent, scheduledCount, historyCount] = await Promise.all([
    populated(WaterRound.find({ status: 'pumping' }).sort({ actualStartedAt: 1, _id: 1 })),
    populated(WaterRound.find(scheduled).sort({ scheduledDate: 1, scheduledTime: 1, _id: 1 }).skip((scheduledPage - 1) * pageSize).limit(pageSize)),
    populated(WaterRound.find(history).sort({ updatedAt: -1, _id: -1 }).skip((historyPage - 1) * pageSize).limit(pageSize)),
    WaterRound.countDocuments(scheduled), WaterRound.countDocuments(history),
  ]);
  return { activeRounds: active.map(adminDto), scheduledRounds: eligible.map(adminDto), history: recent.map(adminDto),
    pagination: { scheduled: pagination(scheduledPage, scheduledCount), history: pagination(historyPage, historyCount) }, generatedAt: now, timeZone: PALESTINE_TIME_ZONE };
}
export async function createCouncilRound(admin, body, { now = new Date() } = {}) {
  exactKeys(body, ['zoneId', 'scheduledDate', 'scheduledTime', 'requestId'], ['zoneId', 'scheduledDate', 'requestId']);
  if (typeof body.requestId !== 'string' || !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(body.requestId)) invalid();
  const values = scheduleValues(body);
  // Ensure the partial unique index is ready before accepting concurrent first requests.
  await WaterRound.init();
  const creationKey = String(admin._id) + ':' + body.requestId.toLowerCase();
  const fingerprint = createHash('sha256').update(JSON.stringify(values)).digest('hex');
  // Check retries before zone availability: a successful request stays identifiable after later edits.
  const existing = await WaterRound.findOne({ creationKey }).select('+creationFingerprint').lean();
  if (existing) {
    if (existing.creationFingerprint !== fingerprint) conflict();
    return { round: await responseRound(existing._id), created: false };
  }
  await activeZone(values.zoneId);
  let round;
  try {
    round = await WaterRound.create({ ...values, creationKey, creationFingerprint: fingerprint, revision: 0,
      createdBy: admin._id, updatedBy: admin._id, audit: [{ action: 'created', at: now, by: admin._id }] });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const duplicate = await WaterRound.findOne({ creationKey }).select('+creationFingerprint').lean();
    if (!duplicate || duplicate.creationFingerprint !== fingerprint) conflict();
    return { round: await responseRound(duplicate._id), created: false };
  }
  return { round: await responseRound(round._id), created: true };
}
export async function changeCouncilRound(admin, id, action, body, { now = new Date() } = {}) {
  if (!objectId(id)) invalid();
  const editing = action === 'edit';
  exactKeys(body, editing ? ['revision', 'zoneId', 'scheduledDate', 'scheduledTime'] : ['revision'], editing ? ['revision', 'zoneId', 'scheduledDate'] : ['revision']);
  const revision = version(body.revision);
  const current = await WaterRound.findById(id).lean();
  if (!current) throw new ApiError(404, 'ROUND_NOT_FOUND', 'الدور المطلوب غير موجود.');
  if ((current.revision || 0) !== revision) conflict();
  const filter = { _id: current._id, ...(revision === 0 ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] } : { revision }) };
  let changes, event, auditAction;
  if (editing) {
    if (current.status !== 'scheduled' || current.actualStartedAt || current.actualEndedAt) conflict();
    const values = scheduleValues(body);
    if (current.publishedAt && String(current.zoneId) !== values.zoneId) invalid('لا يمكن تغيير حارة دور منشور. ألغِ الدور وأنشئ دورًا جديدًا للحارة الصحيحة.', { zoneId: 'حارة الدور المنشور ثابتة.' });
    await activeZone(values.zoneId);
    Object.assign(filter, { status: 'scheduled', actualStartedAt: null, actualEndedAt: null });
    changes = values; auditAction = 'edited';
  } else if (action === 'publish') {
    if (current.status !== 'scheduled' || current.publishedAt || current.actualStartedAt || current.actualEndedAt) conflict();
    await activeZone(current.zoneId);
    Object.assign(filter, { status: 'scheduled', publishedAt: null, actualStartedAt: null, actualEndedAt: null });
    changes = { publishedAt: now, publishedBy: admin._id }; auditAction = 'published';
    event = { key: `water-round:${id.toLowerCase()}:schedule_published`, type: 'schedule_published', zoneId: current.zoneId, occurredAt: now };
  } else if (action === 'start') {
    if (current.status !== 'scheduled' || !current.publishedAt || current.publishedAt > now || current.actualStartedAt || current.actualEndedAt) conflict();
    await activeZone(current.zoneId);
    Object.assign(filter, { ...publishedRoundsFilter(now), status: 'scheduled', actualStartedAt: null, actualEndedAt: null });
    changes = { status: 'pumping', actualStartedAt: now, actualStartedBy: admin._id }; auditAction = 'pumping_started';
    event = { key: `water-round:${id.toLowerCase()}:pumping_started`, type: 'pumping_started', zoneId: current.zoneId, occurredAt: now };
  } else if (action === 'end') {
    if (current.status !== 'pumping' || current.actualEndedAt) conflict();
    Object.assign(filter, { status: 'pumping', actualEndedAt: null });
    changes = { status: 'completed', actualEndedAt: now, actualEndedBy: admin._id }; auditAction = 'completed';
  } else if (action === 'cancel') {
    if (current.status !== 'scheduled' || current.actualStartedAt || current.actualEndedAt) conflict();
    Object.assign(filter, { status: 'scheduled', actualStartedAt: null, actualEndedAt: null });
    changes = { status: 'cancelled', cancelledAt: now, cancelledBy: admin._id }; auditAction = 'cancelled';
  } else invalid();
  // State, revision, responsible administrator, audit record and event intent commit in one document write.
  const result = await WaterRound.findOneAndUpdate(filter, {
    $set: { ...changes, updatedBy: admin._id }, $inc: { revision: 1 },
    $push: { audit: { action: auditAction, at: now, by: admin._id }, ...(event ? { notificationEvents: event } : {}) },
  }, { new: true, runValidators: true });
  if (!result) conflict();
  return { round: await responseRound(id) };
}
