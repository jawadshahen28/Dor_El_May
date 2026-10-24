import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { CitizenReport } from '../models/CitizenReport.js';
import { reportDto, findSubmission, listOwnReports } from '../services/citizenReports.js';
import { normalizeReportDescription, validateCitizenReport } from '@door-el-may/shared/reports';
import { ApiError, success } from '../utils/response.js';

export function reportRoutes(limits) {
  const router = Router();
  router.use(requireAuth, requireRole('resident'));
  router.get('/mine', async (req, res) => success(res, await listOwnReports(req.user._id, req.query)));
  router.post('/', async (req, res, next) => {
    const fields = validateCitizenReport(req.body);
    if (Object.keys(fields).length) throw new ApiError(422, 'VALIDATION_ERROR', 'يرجى مراجعة تفاصيل البلاغ.', fields);
    req.reportInput = { type: req.body.type, description: normalizeReportDescription(req.body.description), submissionId: req.body.submissionId.toLowerCase() };
    const existing = await findSubmission(req.user._id, req.reportInput);
    if (existing) return success(res, { report: reportDto(existing), replayed: true });
    if (!req.user.zoneId) throw new ApiError(409, 'ZONE_UNAVAILABLE', 'حارة حسابك غير متاحة حاليًا. تواصل مع مجلس قروي تلفيت.');
    next();
  }, limits.reportUser, limits.reportDuplicate, async (req, res) => {
    try {
      const item = await CitizenReport.create({ ...req.reportInput, userId: req.user._id, zoneId: req.user.zoneId._id, status: 'new' });
      // The zone is already populated by requireAuth; avoid another lookup.
      return success(res, { report: reportDto({ ...item.toObject(), zoneId: req.user.zoneId }), replayed: false }, 201);
    } catch (error) {
      if (error.code !== 11000) throw error;
      const existing = await findSubmission(req.user._id, req.reportInput);
      if (existing) return success(res, { report: reportDto(existing), replayed: true });
      throw new ApiError(409, 'REPORT_DUPLICATE', 'يوجد بلاغ مماثل. راجع بلاغاتك السابقة قبل إعادة الإرسال.');
    }
  });
  return router;
}
