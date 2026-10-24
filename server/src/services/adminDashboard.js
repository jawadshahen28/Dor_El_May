import { User } from '../models/User.js';
import { WaterRound } from '../models/WaterRound.js';
import { Announcement } from '../models/Announcement.js';
import { CitizenReport } from '../models/CitizenReport.js';
import { PALESTINE_TIME_ZONE } from '@door-el-may/shared/water-time';
import { publishedRoundsFilter, upcomingRoundsFilter } from './waterRoundRead.js';
import { roundPipeline, roundProjection, roundDto } from './waterRoundRead.js';
import { publicAdmin } from '../utils/admin.js';

export async function getAdminDashboard(admin, { now = new Date() } = {}) {
  const published = publishedRoundsFilter(now);
  const [citizens, active, upcoming, newReports, announcements, recentReports, lastUpdate] = await Promise.all([
    // Include pre-role resident records, without rewriting existing accounts.
    User.countDocuments({ $or: [{ role: 'resident' }, { role: { $exists: false } }] }),
    WaterRound.aggregate([
      ...roundPipeline({ ...published, status: 'pumping' }, { actualStartedAt: 1, _id: 1 }),
      { $project: roundProjection },
    ]),
    WaterRound.aggregate([
      ...roundPipeline(upcomingRoundsFilter(now), { scheduledDate: 1, scheduledTime: 1, _id: 1 }),
      { $facet: { count: [{ $count: 'total' }], rows: [{ $limit: 5 }, { $project: roundProjection }] } },
    ]),
    CitizenReport.countDocuments({ status: 'new' }),
    Announcement.countDocuments({ ...published, status: 'published' }),
    CitizenReport.find().sort({ createdAt: -1, _id: -1 }).limit(5)
      .select('type zoneId createdAt status').populate('zoneId', 'name').lean(),
    WaterRound.findOne(published).sort({ updatedAt: -1 }).select('updatedAt').lean(),
  ]);
  return {
    admin: publicAdmin(admin),
    statistics: {
      registeredCitizens: citizens, activePumpingRounds: active.length,
      upcomingWaterRounds: upcoming[0]?.count[0]?.total || 0,
      newReports, publishedAnnouncements: announcements,
    },
    activeRounds: active.map(roundDto), upcomingRounds: (upcoming[0]?.rows || []).map(roundDto),
    recentReports: recentReports.map((report) => ({
      id: String(report._id), type: report.type, status: report.status, createdAt: report.createdAt,
      zone: report.zoneId ? { id: String(report.zoneId._id), name: report.zoneId.name } : null,
    })),
    waterLastUpdatedAt: lastUpdate?.updatedAt || null, generatedAt: now, timeZone: PALESTINE_TIME_ZONE,
  };
}
