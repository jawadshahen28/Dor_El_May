import { User } from '../models/User.js';
import { Zone } from '../models/Zone.js';
import { normalizePhone } from '@door-el-may/shared/phone';
import { normalizeName, validateLogin, validateRegistration } from '@door-el-may/shared/validation';
import { ApiError, success } from '../utils/response.js';
import { hashPassword, verifyPassword, getDummyHash } from '../utils/password.js';
import { csrfToken, establishSession, publicUser } from '../utils/session.js';

const validate = (errors) => {
  if (Object.keys(errors).length) throw new ApiError(422, 'VALIDATION_ERROR', 'يرجى مراجعة الحقول الموضّحة.', errors);
};

export async function register(req, res) {
  validate(validateRegistration(req.body));
  const { fullName, phone, zoneId, password } = req.body;
  const canonicalPhone = normalizePhone(phone);
  const zone = await Zone.findOne({ _id: zoneId, isActive: true });
  if (!zone) throw new ApiError(422, 'VALIDATION_ERROR', 'الحارة المختارة غير متاحة.', { zoneId: 'يرجى اختيار حارة متاحة من القائمة' });
  if (await User.exists({ phone: canonicalPhone })) throw new ApiError(409, 'PHONE_EXISTS', 'رقم الهاتف مسجّل بالفعل. يمكنك تسجيل الدخول.', { phone: 'رقم الهاتف مسجّل بالفعل' });
  const user = await User.create({
    fullName: normalizeName(fullName), phone: canonicalPhone, zoneId: zone._id,
    passwordHash: await hashPassword(password), phoneVerified: false, role: 'resident',
  });
  user.zoneId = zone;
  const token = await establishSession(req, user._id);
  return success(res, { user: publicUser(user), csrfToken: token }, 201);
}

export async function login(req, res) {
  validate(validateLogin(req.body));
  const user = await User.findOne({ phone: normalizePhone(req.body.phone) }).select('+passwordHash').populate('zoneId', 'name');
  const hash = user ? user.passwordHash : await getDummyHash();
  const verified = await verifyPassword(hash, req.body.password);
  if (!user || !verified || user.role !== 'resident' || user.status !== 'active') throw new ApiError(401, 'INVALID_CREDENTIALS', 'رقم الهاتف أو كلمة المرور غير صحيحين');
  const token = await establishSession(req, user._id);
  return success(res, { user: publicUser(user), csrfToken: token });
}

export async function me(req, res) {
  let user = null;
  if (req.session.userId) {
    user = await User.findById(req.session.userId).populate('zoneId', 'name');
    if (!user || user.status !== 'active') {
      user = null;
      await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
    }
  }
  return success(res, { user: user ? publicUser(user) : null, csrfToken: csrfToken(req) });
}

export const logout = (config) => async (req, res) => {
  await new Promise((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
  res.clearCookie(config.cookieName, { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/' });
  return success(res, { user: null });
};
