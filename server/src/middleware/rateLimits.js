import { createHash } from 'node:crypto';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { normalizePhone } from '@door-el-may/shared/phone';
import { failure } from '../utils/response.js';

// Atomic fixed-window counters shared by all server instances and retained on restart.
export class MongoRateLimitStore {
  localKeys = false;
  constructor(collection, prefix) { this.collection = collection; this.prefix = prefix; }
  init(options) { this.windowMs = options.windowMs; }
  bucket(key) {
    const end = (Math.floor(Date.now() / this.windowMs) + 1) * this.windowMs;
    return { id: `${this.prefix}:${key}:${end}`, resetTime: new Date(end) };
  }
  async increment(key) {
    const { id, resetTime } = this.bucket(key);
    const result = await this.collection.findOneAndUpdate({ _id: id }, {
      $inc: { count: 1 }, $setOnInsert: { expiresAt: resetTime },
    }, { upsert: true, returnDocument: 'after', includeResultMetadata: false });
    return { totalHits: result.count, resetTime: result.expiresAt };
  }
  async decrement(key) {
    await this.collection.updateOne({ _id: this.bucket(key).id, count: { $gt: 0 } }, { $inc: { count: -1 } });
  }
  async resetKey(key) { await this.collection.deleteOne({ _id: this.bucket(key).id }); }
}

export async function createRateLimits(connection) {
  const collection = connection.db.collection('auth_rate_limits');
  await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  const make = (prefix, limit, windowMs, extra = {}) => rateLimit({
    windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false,
    store: new MongoRateLimitStore(collection, prefix),
    handler: (_req, res) => failure(res, 429, 'RATE_LIMITED', 'محاولات كثيرة. يرجى الانتظار قليلًا قبل إعادة المحاولة.'),
    ...extra,
  });
  return {
    general: make('general', 300, 15 * 60 * 1000),
    pushUser: make('push-user', 30, 60 * 60 * 1000, { keyGenerator: (req) => String(req.user._id) }),
    loginIp: make('login-ip', 25, 15 * 60 * 1000),
    adminLoginIp: make('admin-login-ip', 25, 15 * 60 * 1000),
    adminLoginPhone: make('admin-login-phone', 10, 15 * 60 * 1000, {
      keyGenerator: (req) => createHash('sha256').update(normalizePhone(req.body?.phone) || ipKeyGenerator(req.ip)).digest('hex'),
    }),
    loginPhone: make('login-phone', 10, 15 * 60 * 1000, {
      keyGenerator: (req) => {
        const phone = normalizePhone(req.body?.phone);
        return createHash('sha256').update(phone || ipKeyGenerator(req.ip)).digest('hex');
      },
    }),
    register: make('register', 10, 60 * 60 * 1000),
    reportUser: make('report-user', 10, 15 * 60 * 1000, {
      keyGenerator: (req) => String(req.user._id),
      handler: (_req, res) => failure(res, 429, 'REPORT_RATE_LIMITED', 'وصلت إلى حد إرسال البلاغات لهذه الفترة. يرجى المحاولة لاحقًا.'),
    }),
    reportDuplicate: make('report-duplicate', 1, 2 * 60 * 1000, {
      keyGenerator: (req) => createHash('sha256').update(JSON.stringify([String(req.user._id), String(req.user.zoneId._id), req.reportInput.type, req.reportInput.description])).digest('hex'),
      handler: (_req, res) => failure(res, 429, 'REPORT_DUPLICATE', 'يوجد بلاغ مماثل أُرسل مؤخرًا. راجع بلاغاتك السابقة قبل إعادة الإرسال.'),
    }),
  };
}
