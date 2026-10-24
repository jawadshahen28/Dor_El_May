import { timingSafeEqual } from 'node:crypto';
import { ApiError } from '../utils/response.js';

export function csrfProtection(origins) {
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('Origin');
    const referer = req.get('Referer');
    let requestOrigin = origin;
    if (!origin && referer) {
      try { requestOrigin = new URL(referer).origin; } catch { requestOrigin = 'invalid'; }
    }
    if (req.get('Sec-Fetch-Site') === 'cross-site' || (requestOrigin && !origins.includes(requestOrigin))) {
      return next(new ApiError(403, 'ORIGIN_INVALID', 'تعذّر التحقق من مصدر الطلب. أعد فتح التطبيق.'));
    }
    const expected = req.session.csrfToken;
    const actual = req.get('X-CSRF-Token');
    if (!expected || !actual || !/^[a-f0-9]{64}$/.test(actual)
      || expected.length !== actual.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
      return next(new ApiError(403, 'CSRF_INVALID', 'انتهت صلاحية الطلب. يرجى إعادة المحاولة.'));
    }
    if (!req.is('application/json')) return next(new ApiError(415, 'CONTENT_TYPE', 'صيغة الطلب غير مدعومة.'));
    next();
  };
}
