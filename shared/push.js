export const PUSH_MESSAGES = {
  schedule_published: { title: 'دور المي 💧', body: 'تم الإعلان عن موعد جديد لدور المياه في حارتك. اضغط لعرض التفاصيل.', url: '/schedule' },
  pumping_started: { title: 'بدأ ضخ المياه 💧', body: 'أعلن مجلس قروي تلفيت بدء ضخ المياه في حارتك.', url: '/home' },
  announcement_published: { title: 'إعلان مجلس قروي تلفيت', body: 'نشر المجلس إعلانًا رسميًا جديدًا. اضغط لقراءته.', url: '/announcements' },
};
export function pushMessage(payload, now = Date.now()) {
  if (!payload || payload.protocol !== 1 || !Object.hasOwn(PUSH_MESSAGES, payload.type) || !/^[a-f\d]{64}$/.test(payload.eventId)
    || !/^[\da-f-]{36}$/.test(payload.binding) || !Number.isSafeInteger(payload.expiresAt) || payload.expiresAt <= now || payload.expiresAt > now + 3600000) return null;
  const message = PUSH_MESSAGES[payload.type];
  const url = payload.type === 'announcement_published' && /^[a-f\d]{24}$/.test(payload.sourceId) ? `/announcements/${payload.sourceId}` : message.url;
  return { ...message, url };
}
export function safeNotificationUrl(value, origin) {
  try {
    const url = new URL(value, origin);
    return url.origin === origin && !url.search && !url.hash && /^\/(?:home|schedule|announcements(?:\/[a-f\d]{24})?)$/.test(url.pathname) ? url.href : new URL('/home', origin).href;
  } catch { return new URL('/home', origin).href; }
}
