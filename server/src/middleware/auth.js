import { User } from '../models/User.js';
import { ApiError } from '../utils/response.js';

export async function requireAuth(req, _res, next) {
  if (!req.session.userId) return next(new ApiError(401, 'UNAUTHENTICATED', 'يرجى تسجيل الدخول للمتابعة.'));
  const user = await User.findById(req.session.userId).populate('zoneId', 'name');
  if (!user || user.status !== 'active') {
    await new Promise((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
    return next(new ApiError(401, 'UNAUTHENTICATED', 'انتهت الجلسة. يرجى تسجيل الدخول مجددًا.'));
  }
  req.user = user;
  next();
}

// Ready for future council routes; a resident can never choose their own role.
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return next(new ApiError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذا الإجراء.'));
  next();
};
