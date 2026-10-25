import mongoose from 'mongoose';
import { PALESTINE_TIME_ZONE, palestineDateTime } from '@door-el-may/shared/water-time';
import { WaterRound } from '../models/WaterRound.js';
import { ApiError } from '../utils/response.js';
import { roundPipeline, roundProjection, roundDto, publishedRoundsFilter, upcomingRoundsFilter } from './waterRoundRead.js';

const statuses = ['scheduled', 'pumping'];
const allowedKeys = new Set(['month', 'zone', 'status', 'page']);
const pageSize = 50;

export function scheduleFilters(query, user, now = new Date()) {
  const invalid = () => { throw new ApiError(422, 'VALIDATION_ERROR', 'يرجى اختيار شهر وحارة وحالة صالحة لعرض الجدول.'); };
  if (Object.entries(query).some(([key, value]) => !allowedKeys.has(key) || typeof value !== 'string')) invalid();
  const month = query.month ?? palestineDateTime(now).date.slice(0, 7);
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 1900) invalid();
  const zone = query.zone ?? 'mine';
  if (!['all', 'mine'].includes(zone) && !/^[a-f\d]{24}$/i.test(zone)) invalid();
  if (query.status !== undefined && !statuses.includes(query.status)) invalid();
  if (query.page !== undefined && !/^[1-9]\d{0,4}$/.test(query.page)) invalid();
  const page = Number(query.page ?? 1);
  const zoneId = zone === 'mine' ? user.zoneId?._id || user.zoneId : zone === 'all' ? null : new mongoose.Types.ObjectId(zone);
  const [year, monthNumber] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    month, zone, page, zoneMissing: zone === 'mine' && !zoneId,
    filter: {
      ...publishedRoundsFilter(now), ...(zoneId ? { zoneId } : {}),
      // Current pumping is independent of the selected/planned month. Scheduled
      // rows must still be upcoming; elapsed clocks never promote a round.
      $or: [
        ...(query.status === 'scheduled' ? [] : [{ status: 'pumping' }]),
        ...(query.status === 'pumping' ? [] : [{ $and: [upcomingRoundsFilter(now), { scheduledDate: { $gte: `${month}-01`, $lte: `${month}-${days}` } }] }]),
      ],
    },
  };
}

export async function getWaterSchedule(user, query, { now = new Date() } = {}) {
  const { month, zone, page, filter, zoneMissing } = scheduleFilters(query, user, now);
  // Count and page share one query. Join before paginating so deleted references
  // cannot displace valid rows or inflate the total. No status is changed here.
  const [result] = zoneMissing ? [] : await WaterRound.aggregate([
    ...roundPipeline(filter, { scheduledDate: 1, scheduledTime: 1, _id: 1 }),
    { $facet: {
      active: [{ $match: { status: 'pumping' } }, { $sort: { actualStartedAt: 1, _id: 1 } }, { $project: roundProjection }],
      rows: [{ $match: { status: 'scheduled' } }, { $skip: (page - 1) * pageSize }, { $limit: pageSize }, { $project: roundProjection }],
      count: [{ $match: { status: 'scheduled' } }, { $count: 'total' }],
    } },
  ]);
  const total = result?.count[0]?.total || 0;
  return {
    month, zone, status: query.status || null, activeRounds: (result?.active || []).map(roundDto), rounds: (result?.rows || []).map(roundDto),
    pagination: { page, pageSize, total, hasMore: page * pageSize < total },
    generatedAt: now, timeZone: PALESTINE_TIME_ZONE,
  };
}
