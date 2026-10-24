import { normalizePhone } from './phone.js';

export const normalizeName = (value) => typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : '';

export function validateLogin(values = {}) {
  const errors = {};
  if (typeof values.phone !== 'string' || !values.phone.trim()) errors.phone = 'يرجى إدخال رقم الهاتف';
  else if (!normalizePhone(values.phone)) errors.phone = 'رقم الهاتف غير صحيح، أدخل رقم جوال من 10 أرقام يبدأ بـ 05';
  if (typeof values.password !== 'string' || !values.password) errors.password = 'يرجى إدخال كلمة المرور';
  else if (values.password.length > 128) errors.password = 'كلمة المرور أطول من الحد المسموح';
  return errors;
}

export function validateRegistration(values = {}) {
  const errors = validateLogin(values);
  const name = normalizeName(values.fullName);
  if (!name) errors.fullName = 'يرجى إدخال الاسم الكامل';
  else if (name.length > 100 || !/^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u.test(name)
    || name.split(' ').length < 2) errors.fullName = 'أدخل اسمك من كلمتين على الأقل، باستخدام الحروف';
  if (typeof values.zoneId !== 'string' || !/^[a-f\d]{24}$/i.test(values.zoneId)) errors.zoneId = 'يرجى اختيار حارتك';
  if (typeof values.password === 'string' && values.password && (values.password.length < 8
    || values.password.length > 128 || !/[a-zA-Z]/.test(values.password) || !/\d/.test(values.password))) {
    errors.password = 'استخدم 8 خانات على الأقل، تتضمن حرفًا إنجليزيًا ورقمًا (بحد أقصى 128 خانة)';
  }
  if (typeof values.confirmPassword !== 'string' || !values.confirmPassword) errors.confirmPassword = 'يرجى تأكيد كلمة المرور';
  else if (values.confirmPassword !== values.password) errors.confirmPassword = 'كلمتا المرور غير متطابقتين';
  return errors;
}
