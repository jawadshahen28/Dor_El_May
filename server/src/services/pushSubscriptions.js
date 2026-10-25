import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes, randomUUID, ECDH } from 'node:crypto';
import { PushSubscription } from '../models/PushSubscription.js';
import { ApiError } from '../utils/response.js';

export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const pushSessionHash = (sessionId, secret) => createHmac('sha256', secret).update(sessionId).digest('hex');
const invalid = () => { throw new ApiError(422, 'PUSH_INVALID', 'تعذّر تسجيل هذا الجهاز. تحقّق من دعم المتصفح وحدّث التطبيق.'); };
export function deviceHash(token) { if (typeof token !== 'string' || !/^[a-f\d]{64}$/.test(token)) invalid(); return digest(token); }
export function validPushEndpoint(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.port
      && (['fcm.googleapis.com', 'updates.push.services.mozilla.com'].includes(url.hostname) || url.hostname.endsWith('.push.apple.com'));
  } catch { return false; }
}
function key(value, length) { return typeof value === 'string' && /^[\w-]+$/.test(value) && Buffer.from(value, 'base64url').length === length && Buffer.from(value, 'base64url').toString('base64url') === value; }
export function validateSubscription(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((name) => !['endpoint', 'keys', 'expirationTime'].includes(name))) invalid();
  if (!validPushEndpoint(input.endpoint) || !input.keys || Object.keys(input.keys).sort().join(',') !== 'auth,p256dh'
    || !key(input.keys.auth, 16) || !key(input.keys.p256dh, 65) || Buffer.from(input.keys.p256dh, 'base64url')[0] !== 4) invalid();
  try { ECDH.convertKey(Buffer.from(input.keys.p256dh, 'base64url'), 'prime256v1'); } catch { invalid(); }
  const expiration = input.expirationTime;
  if (expiration != null && (!Number.isSafeInteger(expiration) || expiration <= Date.now() || expiration > 8640000000000000)) invalid();
  return { endpoint: new URL(input.endpoint).href, keys: { auth: input.keys.auth, p256dh: input.keys.p256dh }, expirationTime: expiration ?? null };
}
export function encryptSubscription(value, encryptionKey, installationHash) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(encryptionKey, 'base64url'), iv);
  cipher.setAAD(Buffer.from(installationHash));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((buffer) => buffer.toString('base64url')).join('.');
}
export function decryptSubscription(record, encryptionKey) {
  const [iv, tag, value] = record.encrypted.split('.').map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(encryptionKey, 'base64url'), iv);
  decipher.setAAD(Buffer.from(record.installationHash)); decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(value), decipher.final()]).toString());
}
export async function revokePushSession(sessionId, secret) {
  if (sessionId) await PushSubscription.updateMany({ sessionHash: pushSessionHash(sessionId, secret), active: true }, { $set: { active: false, purgeAt: new Date(Date.now() + 30 * 86400000) } });
}
export async function registerPush(req, config) {
  if (!config.push.configured) throw new ApiError(503, 'PUSH_UNAVAILABLE', 'الإشعارات غير مهيأة على الخادم بعد.');
  const body = req.body;
  if (!body || Object.keys(body).sort().join(',') !== 'deviceToken,subscription') invalid();
  const installationHash = deviceHash(body.deviceToken), subscription = validateSubscription(body.subscription);
  const endpointHash = digest(subscription.endpoint), sessionHash = pushSessionHash(req.sessionID, config.sessionSecret);
  await PushSubscription.init();
  const existing = await PushSubscription.findOne({ $or: [{ installationHash }, { endpointHash }] }).select('+installationHash +endpointHash +binding +keyVersion +sessionHash').lean();
  if (existing && (existing.installationHash !== installationHash || existing.endpointHash !== endpointHash)) {
    // An explicitly opted-in browser may replace its old endpoint, never claim another installation's endpoint.
    if (existing.installationHash !== installationHash || await PushSubscription.exists({ endpointHash, _id: { $ne: existing._id } })) throw new ApiError(409, 'PUSH_CONFLICT', 'هذا الاشتراك مرتبط بجهاز آخر. أعد إيقاف الإشعارات وتفعيلها.');
  }
  if (!existing && await PushSubscription.countDocuments({ userId: req.user._id, active: true }) >= 10) throw new ApiError(409, 'PUSH_DEVICE_LIMIT', 'وصلت إلى الحد المسموح للأجهزة. أوقف اشتراك جهاز قديم أولًا.');
  const same = existing?.active && String(existing.userId) === String(req.user._id) && existing.sessionHash === sessionHash && existing.endpointHash === endpointHash && existing.keyVersion === config.push.keyVersion;
  const binding = same ? existing.binding : randomUUID(), consentAt = same ? existing.consentAt : new Date();
  const encrypted = encryptSubscription({ ...subscription, sessionId: req.sessionID }, config.push.encryptionKey, installationHash);
  const values = { userId: req.user._id, installationHash, endpointHash, encrypted, sessionHash, binding, consentAt, lastSeenAt: new Date(), keyVersion: config.push.keyVersion, active: true, purgeAt: null, expiresAt: subscription.expirationTime ? new Date(subscription.expirationTime) : null };
  let saved;
  try {
    // Unique installation/endpoint indexes resolve registration races. A conflict can be retried safely.
    saved = await PushSubscription.findOneAndUpdate(existing ? { _id: existing._id, revision: existing.revision } : { installationHash },
      existing ? { $set: values, $inc: { revision: 1 } } : { $setOnInsert: { ...values, revision: 0 } },
      { upsert: !existing, new: true, runValidators: true }).select('+binding +sessionHash +endpointHash +keyVersion');
    if (!saved || String(saved.userId) !== String(req.user._id) || saved.sessionHash !== sessionHash || saved.endpointHash !== endpointHash || saved.keyVersion !== config.push.keyVersion) throw new Error('conflict');
  } catch (error) {
    if (error.code !== 11000 && error.message !== 'conflict') throw error;
    throw new ApiError(409, 'PUSH_CONFLICT', 'تغيّر اشتراك الجهاز. أعد المحاولة.');
  }
  return { active: true, binding: saved.binding };
}
