import { normalizePhone } from '@door-el-may/shared/phone';
import { normalizeName, validateLogin } from '@door-el-may/shared/validation';
import { User } from '../models/User.js';
import { hashPassword } from '../utils/password.js';
import { ApiError } from '../utils/response.js';
import { publicAdmin } from '../utils/admin.js';

export function validateAdminAccount(values) {
  const fields = validateLogin(values);
  const name = normalizeName(values.fullName);
  if (name.length > 100 || !/^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u.test(name) || name.split(' ').length < 2) {
    fields.fullName = 'Full name must contain at least two words using letters (maximum 100 characters).';
  }
  if (typeof values.password !== 'string' || values.password.length < 12 || values.password.length > 128
    || !/[a-zA-Z]/.test(values.password) || !/\d/.test(values.password)) {
    fields.password = 'Use 12–128 characters including an English letter and a number.';
  }
  if (values.confirmPassword !== values.password) fields.confirmPassword = 'Passwords do not match.';
  return fields;
}

export async function createAdminAccount(values) {
  const fields = validateAdminAccount(values);
  if (Object.keys(fields).length) throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid administrator credentials.', fields);
  const phone = normalizePhone(values.phone);
  // Never promote, replace, or otherwise alter an existing citizen or admin.
  await User.init();
  if (await User.exists({ phone })) throw new ApiError(409, 'ACCOUNT_EXISTS', 'This phone is already registered. No account was changed.');
  try {
    const user = await User.create({
      fullName: normalizeName(values.fullName), phone, passwordHash: await hashPassword(values.password),
      role: 'admin', status: 'active', phoneVerified: false,
    });
    return publicAdmin(user);
  } catch (error) {
    if (error.code === 11000) throw new ApiError(409, 'ACCOUNT_EXISTS', 'This phone is already registered. No account was changed.');
    throw error;
  }
}
