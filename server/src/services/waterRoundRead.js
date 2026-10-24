import { WaterRound } from '../models/WaterRound.js';
import { Zone } from '../models/Zone.js';
import { palestineDateTime } from '@door-el-may/shared/water-time';

export const publishedRoundsFilter = (now) => ({ publishedAt: { $type: 'date', $lte: now } });
export function upcomingRoundsFilter(now) {
  const local = palestineDateTime(now);
  return {
    ...publishedRoundsFilter(now), status: 'scheduled',
    $or: [
      { scheduledDate: { $gt: local.date } },
      { scheduledDate: local.date, $or: [{ scheduledTime: null }, { scheduledTime: { $gte: local.time } }] },
    ],
  };
}

export function roundPipeline(filter, sort) {
  return [
    { $match: filter }, { $sort: sort },
    { $lookup: { from: Zone.collection.name, localField: 'zoneId', foreignField: '_id', as: 'zone' } },
    { $unwind: '$zone' },
  ];
}

export const roundProjection = {
  _id: 1, zone: { _id: 1, name: 1 }, scheduledDate: 1, scheduledTime: 1, status: 1,
  actualStartedAt: 1, actualEndedAt: 1, publishedAt: 1, updatedAt: 1,
};

export const roundDto = (round) => ({
  id: String(round._id), zone: { id: String(round.zone._id), name: round.zone.name },
  scheduledDate: round.scheduledDate, scheduledTime: round.scheduledTime || null, status: round.status,
  actualStartedAt: round.actualStartedAt || null, actualEndedAt: round.actualEndedAt || null,
  publishedAt: round.publishedAt, updatedAt: round.updatedAt,
});
