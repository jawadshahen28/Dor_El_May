import { failure } from '../utils/response.js';

export function errorHandler(error, _req, res, _next) {
  if (error.code === 11000) return failure(res, 409, 'PHONE_EXISTS', 'رقم الهاتف مسجّل بالفعل. يمكنك تسجيل الدخول.', { phone: 'رقم الهاتف مسجّل بالفعل' });
  if (error.name === 'ValidationError' || error.name === 'CastError') return failure(res, 422, 'VALIDATION_ERROR', 'يرجى التأكد من صحة المعلومات المدخلة.');
  if (error.type === 'entity.parse.failed') return failure(res, 400, 'INVALID_JSON', 'تعذّرت قراءة الطلب.');
  if (error.type === 'entity.too.large') return failure(res, 413, 'BODY_TOO_LARGE', 'حجم الطلب أكبر من المسموح.');
  if (error.status && error.code) return failure(res, error.status, error.code, error.message, error.fields);
  const unavailable = /Mongo|Mongoose/.test(error.name || '');
  // Never print request bodies, connection strings, password hashes, or raw driver errors.
  console.error(unavailable ? 'Database operation unavailable.' : 'Unexpected API error.', { type: error.name });
  return failure(res, unavailable ? 503 : 500, unavailable ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR', 'الخدمة غير متاحة مؤقتًا. يرجى المحاولة لاحقًا.');
}
