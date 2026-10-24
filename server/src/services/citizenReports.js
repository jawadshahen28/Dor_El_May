import { CitizenReport } from '../models/CitizenReport.js';
import { Zone } from '../models/Zone.js';
import { ApiError } from '../utils/response.js';
import { PALESTINE_TIME_ZONE } from '@door-el-may/shared/water-time';

export const reportDto = (item) => ({
  id: String(item._id), type: item.type, description: item.description, status: item.status, createdAt: item.createdAt,
  zone: item.zoneId ? { id: String(item.zoneId._id), name: item.zoneId.name } : null,
});

export async function findSubmission(userId, input) {
  const report = await CitizenReport.findOne({ userId, submissionId: input.submissionId }).populate('zoneId', 'name');
  if (report && (report.type !== input.type || report.description !== input.description)) {
    throw new ApiError(409, 'SUBMISSION_CONFLICT', 'تعذّر إعادة استخدام طلب الإرسال. أعد فتح النموذج لبلاغ جديد.');
  }
  return report;
}

export async function listOwnReports(userId, query) {
  if (Object.entries(query).some(([key, value]) => key !== 'page' || typeof value !== 'string')
    || (query.page !== undefined && !/^[1-9]\d{0,4}$/.test(query.page))) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'يرجى اختيار رقم صفحة صالح لبلاغاتك.');
  }
  const page = Number(query.page || 1), pageSize = 10;
  const [result] = await CitizenReport.aggregate([
    { $match: { userId } }, { $sort: { createdAt: -1, _id: -1 } },
    { $facet: {
      rows: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize },
        { $lookup: { from: Zone.collection.name, localField: 'zoneId', foreignField: '_id', as: 'zoneId', pipeline: [{ $project: { name: 1 } }] } },
        { $unwind: { path: '$zoneId', preserveNullAndEmptyArrays: true } },
        { $project: { type: 1, description: 1, status: 1, zoneId: 1, createdAt: 1 } }],
      count: [{ $count: 'total' }],
    } },
  ]);
  const total = result?.count[0]?.total || 0;
  return { reports: (result?.rows || []).map(reportDto), pagination: { page, pageSize, total, hasMore: page * pageSize < total }, timeZone: PALESTINE_TIME_ZONE };
}
