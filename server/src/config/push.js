import { createECDH, createHash } from 'node:crypto';

const valid64 = (value, bytes) => typeof value === 'string' && /^[\w-]+$/.test(value) && Buffer.from(value, 'base64url').length === bytes && Buffer.from(value, 'base64url').toString('base64url') === value;
export function loadPushConfig(source = process.env) {
  if (source.PUSH_OUTBOUND_ENABLED && !['true', 'false'].includes(source.PUSH_OUTBOUND_ENABLED)) throw new Error('PUSH_OUTBOUND_ENABLED must be true or false.');
  const publicKey = source.VAPID_PUBLIC_KEY || '', privateKey = source.VAPID_PRIVATE_KEY || '', encryptionKey = source.PUSH_SUBSCRIPTION_KEY || '';
  let keysValid = false;
  try {
    const pair = createECDH('prime256v1'); pair.setPrivateKey(Buffer.from(privateKey, 'base64url'));
    keysValid = valid64(publicKey, 65) && valid64(privateKey, 32) && pair.getPublicKey().toString('base64url') === publicKey;
  } catch {}
  const subject = source.VAPID_SUBJECT || '';
  let subjectValid = false;
  try { const url = new URL(subject); subjectValid = ['mailto:', 'https:'].includes(url.protocol) && !subject.includes('localhost') && !url.username && !url.password && (url.protocol === 'mailto:' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url.pathname) : !!url.hostname); } catch {}
  const configured = keysValid && subjectValid && valid64(encryptionKey, 32);
  const enabled = source.PUSH_OUTBOUND_ENABLED === 'true';
  const confirmed = source.PUSH_STAGING_CONFIRMED === 'true';
  const databaseName = source.PUSH_STAGING_DATABASE || '';
  const testUserIds = (source.PUSH_TEST_USER_IDS || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  const cutoff = new Date(source.PUSH_DELIVERY_NOT_BEFORE || NaN);
  const safeToSend = configured && confirmed && /(?:staging|stage|test)/i.test(databaseName)
    && testUserIds.length > 0 && testUserIds.length <= 20 && testUserIds.every((id) => /^[a-f\d]{24}$/.test(id))
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(source.PUSH_DELIVERY_NOT_BEFORE || '') && Number.isFinite(cutoff.getTime());
  if (enabled && !safeToSend) throw new Error('Push sending requires valid VAPID/storage keys, PUSH_STAGING_CONFIRMED, PUSH_STAGING_DATABASE, PUSH_TEST_USER_IDS and PUSH_DELIVERY_NOT_BEFORE.');
  const keyVersion = createHash('sha256').update(publicKey).digest('hex');
  return { configured, enabled, confirmed, databaseName, testUserIds: [...new Set(testUserIds)], cutoff,
    publicKey, privateKey, subject, encryptionKey, keyVersion,
    campaignId: createHash('sha256').update(JSON.stringify([databaseName, testUserIds.sort(), source.PUSH_DELIVERY_NOT_BEFORE || '', keyVersion])).digest('hex'),
  };
}
