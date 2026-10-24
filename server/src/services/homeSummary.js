import { WaterRound } from '../models/WaterRound.js';
import { Announcement } from '../models/Announcement.js';
import { roundPipeline, roundProjection, roundDto, publishedRoundsFilter, upcomingRoundsFilter } from './waterRoundRead.js';
import { publicUser } from '../utils/session.js';
import { PALESTINE_TIME_ZONE } from '@door-el-may/shared/water-time';

function findRounds(filter, sort, limit) {
  const pipeline = roundPipeline(filter, sort);
  // Join before limiting: a deleted zone must not displace a valid upcoming round.
  if (limit) pipeline.push({ $limit: limit });
  pipeline.push({ $project: roundProjection });
  return WaterRound.aggregate(pipeline);
}

export async function getHomeSummary(user, { now = new Date() } = {}) {
  const published = publishedRoundsFilter(now);
  // A past scheduled clock time is not promoted to pumping. Unknown times remain
  // eligible throughout their local calendar day; no time is invented for them.
  const upcoming = upcomingRoundsFilter(now);
  const order = { scheduledDate: 1, scheduledTime: 1, _id: 1 };
  const zoneId = user.zoneId?._id;
  const [active, myNext, nextThree, announcement, waterUpdate] = await Promise.all([
    findRounds({ ...published, status: 'pumping' }, { actualStartedAt: 1, _id: 1 }),
    zoneId ? findRounds({ ...upcoming, zoneId }, order, 1) : Promise.resolve([]),
    findRounds(upcoming, order, 3),
    Announcement.findOne({ ...published, status: 'published' }).sort({ publishedAt: -1, _id: -1 }).select('title content publishedAt').lean(),
    WaterRound.findOne(published).sort({ updatedAt: -1 }).select('updatedAt').lean(),
  ]);
  const currentUser = publicUser(user);
  return {
    user: currentUser, zone: currentUser.zone,
    activeRounds: active.map(roundDto), myNextRound: myNext[0] ? roundDto(myNext[0]) : null,
    upcomingRounds: nextThree.map(roundDto),
    latestAnnouncement: announcement ? {
      id: String(announcement._id), title: announcement.title, content: announcement.content,
      publishedAt: announcement.publishedAt,
    } : null,
    waterLastUpdatedAt: waterUpdate?.updatedAt || null,
    generatedAt: now, timeZone: PALESTINE_TIME_ZONE,
  };
}
