import { randomBytes } from 'node:crypto';
import { revokePushSession } from '../services/pushSubscriptions.js';

export function csrfToken(req) {
  req.session.csrfToken ||= randomBytes(32).toString('hex');
  return req.session.csrfToken;
}
export async function establishSession(req, userId) {
  await revokePushSession(req.sessionID, req.app.locals.pushSessionSecret);
  await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
  req.session.userId = String(userId);
  const token = csrfToken(req);
  await new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
  return token;
}
export const publicUser = (user) => ({
  id: String(user._id), fullName: user.fullName, phone: user.phone,
  zone: user.zoneId ? { id: String(user.zoneId._id), name: user.zoneId.name } : null,
  phoneVerified: user.phoneVerified, role: user.role, createdAt: user.createdAt,
});
