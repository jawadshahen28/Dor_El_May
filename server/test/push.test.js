import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createECDH } from 'node:crypto';
import { loadPushConfig } from '../src/config/push.js';
import { validateSubscription, validPushEndpoint, encryptSubscription, decryptSubscription } from '../src/services/pushSubscriptions.js';
import { publicAddress, sendWebPush } from '../src/services/pushTransport.js';
import { processPushBatch } from '../src/services/pushProcessor.js';
import { pushMessage, safeNotificationUrl } from '../../shared/push.js';
import { setupWorkerPush } from '../../client/src/notifications/workerPush.js';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

test('outbound sending defaults off and cannot be enabled without all staging gates', async () => {
  assert.equal(loadPushConfig({}).enabled, false); assert.equal(loadPushConfig({}).configured, false);
  assert.throws(() => loadPushConfig({ PUSH_OUTBOUND_ENABLED: 'yes' }));
  assert.throws(() => loadPushConfig({ PUSH_OUTBOUND_ENABLED: 'true' }));
  let sent = 0;
  const result = await processPushBatch({ config: loadPushConfig({}), transport: () => { sent++; } });
  assert.equal(sent, 0); assert.equal(result.enabled, false);
});
test('subscription endpoint/provider validation and public-only DNS rules reject SSRF targets', () => {
  for (const endpoint of ['http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://evil.example/x', 'https://fcm.googleapis.com.evil.example/x', 'https://fcm.googleapis.com:444/x', 'https://user:pass@fcm.googleapis.com/x', 'https://fcm.googleapis.com/x#fragment']) assert.equal(validPushEndpoint(endpoint), false);
  for (const address of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '169.254.169.254', '100.64.1.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '0.0.0.0']) assert.equal(publicAddress(address), false);
  assert.equal(publicAddress('8.8.8.8'), true); assert.equal(publicAddress('2606:4700:4700::1111'), true);
});
test('AES-GCM storage authenticates both ciphertext and installation identity', () => {
  const key = randomBytes(32).toString('base64url'), value = { endpoint: 'https://fcm.googleapis.com/synthetic', keys: { auth: 'synthetic' }, sessionId: 'synthetic-session' };
  const encrypted = encryptSubscription(value, key, 'installation');
  assert.ok(!encrypted.includes(value.endpoint)); assert.deepEqual(decryptSubscription({ encrypted, installationHash: 'installation' }, key), value);
  assert.throws(() => decryptSubscription({ encrypted, installationHash: 'different' }, key));
  assert.throws(() => decryptSubscription({ encrypted, installationHash: 'installation' }, randomBytes(32).toString('base64url')));
});
test('push payloads use fixed Arabic copy and click destinations cannot escape approved app routes', async () => {
  const payload = { protocol: 1, type: 'schedule_published', eventId: 'a'.repeat(64), binding: '12345678-1234-1234-1234-123456789abc', expiresAt: Date.now() + 10000 };
  assert.equal(pushMessage(payload).url, '/schedule'); assert.equal(pushMessage({ ...payload, type: 'pumping_started' }).url, '/home');
  assert.equal(pushMessage({ ...payload, type: '__proto__' }), null); assert.equal(pushMessage({ ...payload, expiresAt: 0 }), null);
  for (const url of ['https://evil.example', '//evil.example', '/admin', '/account', '/home?token=x', 'javascript:alert(1)', '/announcements/not-an-id']) assert.equal(safeNotificationUrl(url, 'https://app.example'), 'https://app.example/home');
  assert.equal(safeNotificationUrl('/schedule', 'https://app.example'), 'https://app.example/schedule');
  await assert.rejects(sendWebPush({}, {}, { enabled: false }, 10));
});
test('browser encryption keys must be real P-256 points and correctly sized auth secrets', () => {
  const pair = createECDH('prime256v1'); pair.generateKeys();
  const input = { endpoint: 'https://web.push.apple.com/synthetic', keys: { p256dh: pair.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
  assert.equal(validateSubscription(input).expirationTime, null);
  assert.throws(() => validateSubscription({ ...input, keys: { ...input.keys, p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString('base64url') } }));
});
test('notification clicks open approved pages without navigating an existing unsaved form', async () => {
  const handlers = {}, opened = [];
  const worker = { location: { origin: 'https://app.example' }, addEventListener: (type, handler) => { handlers[type] = handler; },
    clients: { matchAll: async () => [{ url: 'https://app.example/reports', navigate: () => assert.fail('Existing form must not be navigated.') }], openWindow: async (url) => opened.push(url) } };
  setupWorkerPush(worker);
  let done, closed = false;
  handlers.notificationclick({ notification: { data: { url: '/schedule' }, close: () => { closed = true; } }, waitUntil: (promise) => { done = promise; } });
  await done; assert.equal(closed, true); assert.deepEqual(opened, ['https://app.example/schedule']);
});
test('key preparation never prints secrets or overwrites files; disabled CLI never connects to MongoDB', () => {
  mkdirSync(resolve('.cache'), { recursive: true });
  const directory = mkdtempSync(resolve('.cache/push-key-test-'));
  const command = resolve('scripts/generate-push-keys.mjs');
  const output = execFileSync(process.execPath, [command], { cwd: directory, encoding: 'utf8' });
  const generated = readFileSync(resolve(directory, '.local/push-staging.env'), 'utf8');
  for (const line of generated.split('\n')) { const value = line.slice(line.indexOf('=') + 1); if (value.length > 30) assert.ok(!output.includes(value)); }
  assert.throws(() => execFileSync(process.execPath, [command], { cwd: directory, stdio: 'pipe' }));
  assert.equal(readFileSync(resolve(directory, '.local/push-staging.env'), 'utf8'), generated);
  const disabled = execFileSync(process.execPath, [resolve('server/src/process-push.js')], { encoding: 'utf8', timeout: 8000,
    env: { ...process.env, NODE_ENV: 'development', SESSION_SECRET: 'disabled-push-cli-test-secret-32-characters', MONGODB_URI: 'mongodb://127.0.0.1:1/must_not_connect', PUSH_OUTBOUND_ENABLED: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
  assert.match(disabled, /Push delivery disabled/);
});
