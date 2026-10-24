import { User } from '../models/User.js';
import { normalizePhone } from '@door-el-may/shared/phone';
import { validateLogin } from '@door-el-may/shared/validation';
import { ApiError, success } from '../utils/response.js';
import { getDummyHash, verifyPassword } from '../utils/password.js';
import { establishSession, publicUser } from '../utils/session.js';
import { ADMIN_ROLES } from '../utils/admin.js';

export async function adminLogin(req, res) {
  const fields = validateLogin(req.body);
  if (Object.keys(fields).length) throw new ApiError(422, 'VALIDATION_ERROR', 'يرجى مراجعة الحقول الموضّحة.', fields);
  const user = await User.findOne({ phone: normalizePhone(req.body.phone) }).select('+passwordHash');
  const verified = await verifyPassword(user?.passwordHash || await getDummyHash(), req.body.password);
  if (!user || !verified || !ADMIN_ROLES.includes(user.role) || user.status !== 'active') {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'رقم الهاتف أو كلمة المرور غير صحيحين');
  }
  const token = await establishSession(req, user._id);
  return success(res, { user: publicUser(user), csrfToken: token });
}
