import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { PushSubscription } from '../models/PushSubscription.js';
import { deviceHash, pushSessionHash, registerPush } from '../services/pushSubscriptions.js';
import { success, ApiError } from '../utils/response.js';

export function notificationRoutes(config, limits) {
  const router = Router();
  router.use(requireAuth, requireRole('resident'));
  router.get('/config', (req, res) => success(res, { configured: config.push.configured, outboundEnabled: config.push.enabled,
    publicKey: config.push.configured ? config.push.publicKey : null, protocol: 1 }));
  router.get('/subscription', async (req, res) => {
    if (Object.keys(req.query).length) throw new ApiError(422, 'PUSH_INVALID', 'طلب غير صالح.');
    const token = req.get('X-Push-Device');
    if (!token) return success(res, { active: false });
    const record = await PushSubscription.findOne({ installationHash: deviceHash(token), userId: req.user._id, active: true,
      sessionHash: pushSessionHash(req.sessionID, config.sessionSecret), keyVersion: config.push.keyVersion,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }).select('+binding').lean();
    if (record) await PushSubscription.updateOne({ _id: record._id, active: true, binding: record.binding }, { $set: { lastSeenAt: new Date() } });
    return success(res, { active: !!record, ...(record ? { binding: record.binding } : {}) });
  });
  router.post('/subscription', limits.pushUser, async (req, res) => success(res, await registerPush(req, config)));
  router.delete('/subscription', limits.pushUser, async (req, res) => {
    if (!req.body || Object.keys(req.body).join(',') !== 'deviceToken') throw new ApiError(422, 'PUSH_INVALID', 'طلب غير صالح.');
    await PushSubscription.updateOne({ installationHash: deviceHash(req.body.deviceToken), userId: req.user._id }, { $set: { active: false, purgeAt: new Date(Date.now() + 30 * 86400000) } });
    return success(res, { active: false });
  });
  return router;
}
