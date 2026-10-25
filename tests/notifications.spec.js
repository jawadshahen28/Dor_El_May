import { test, expect } from '@playwright/test';
import { createECDH, randomBytes, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { isPublicStaticUrl } from '../client/src/pwa/cachePolicy.js';

test.use({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });
const origin = 'http://127.0.0.1:4173';
async function setup(page, index, options = {}) {
  const pair = createECDH('prime256v1'); pair.generateKeys();
  const input = { endpoint: 'https://fcm.googleapis.com/fcm/send/browser-fixture-' + randomUUID(), expirationTime: null,
    keys: { p256dh: pair.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
  await page.addInitScript(({ input, denied, unsupported, iphone }) => {
    window.pushPermissionCalls = 0; window.pushSubscribeCalls = 0; window.pushUnsubscribeCalls = 0;
    window.fixturePermission = denied ? 'denied' : 'default';
    window.Notification = class { static get permission() { return window.fixturePermission; } static requestPermission() { window.pushPermissionCalls++; window.fixturePermission = 'granted'; return Promise.resolve('granted'); } };
    if (unsupported) { delete window.PushManager; }
    else {
      const sub = { options: {}, toJSON: () => input, unsubscribe: async () => { window.pushUnsubscribeCalls++; sessionStorage.removeItem('fixture-push-active'); if (window.fixtureSlowUnsubscribe) return new Promise(() => {}); return true; } };
      PushManager.prototype.getSubscription = async () => sessionStorage.getItem('fixture-push-active') ? sub : null;
      PushManager.prototype.subscribe = async () => { window.pushSubscribeCalls++; sessionStorage.setItem('fixture-push-active', '1'); return sub; };
    }
    if (iphone) Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1' });
  }, { input, ...options });
  await page.goto('/login');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })); });
  const initial = (await (await page.request.get('/api/auth/me')).json()).data;
  const result = await page.request.post('/api/auth/login', { headers: { Origin: origin, 'X-CSRF-Token': initial.csrfToken }, data: { phone: `05977${String(index).padStart(5, '0')}`, password: 'PushBrowserFixture9!' } });
  expect(result.status()).toBe(200); await page.goto('/home');
  await expect(page.getByRole('button', { name: 'الإشعارات', exact: true })).toBeVisible();
  return input;
}
async function open(page) { await page.getByRole('button', { name: 'الإشعارات', exact: true }).click(); await expect(page).toHaveURL(/\/notifications$/); await expect(page.getByRole('heading', { name: 'الإشعارات', exact: true })).toBeVisible(); }
async function enable(page) { await open(page); await page.getByRole('button', { name: 'تفعيل الإشعارات', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('مفعّل'); }

test('opt-in requires an explicit click; subscription status, opt-out and mobile/desktop controls are honest', async ({ page }) => {
  await setup(page, 0); expect(await page.evaluate(() => window.pushPermissionCalls)).toBe(0);
  await open(page); expect(await page.evaluate(() => window.pushPermissionCalls)).toBe(0);
  await expect(page.getByText('خلّيك على اطلاع بأخبار المياه', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'تفعيل الإشعارات', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('مفعّل');
  expect(await page.evaluate(() => window.pushPermissionCalls)).toBe(1); expect(await page.evaluate(() => window.pushSubscribeCalls)).toBe(1);
  await mkdir('artifacts/screenshots', { recursive: true });
  for (const width of [390, 1440]) { await page.setViewportSize({ width, height: 900 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: `artifacts/screenshots/notifications-${width}.png` }); }
  await page.getByRole('button', { name: 'إيقاف الإشعارات', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('غير مفعّل');
  expect(await page.evaluate(() => window.pushUnsubscribeCalls)).toBeGreaterThan(0);
});
test('denied permissions and unsupported iPhone browser modes explain the next steps without requesting permission', async ({ page, browser }) => {
  await setup(page, 1, { denied: true }); await open(page);
  await expect(page.getByRole('button', { name: 'تفعيل الإشعارات', exact: true })).toBeDisabled();
  await expect(page.getByText(/غيّر الإذن من إعدادات المتصفح/)).toBeVisible(); expect(await page.evaluate(() => window.pushPermissionCalls)).toBe(0);
  const context = await browser.newContext({ baseURL: origin, serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });
  try {
    const iphone = await context.newPage(); await setup(iphone, 2, { unsupported: true, iphone: true }); await open(iphone);
    await expect(iphone.getByText(/مشاركة ← إضافة إلى الشاشة الرئيسية/)).toBeVisible();
    await expect(iphone.getByRole('button', { name: 'تفعيل الإشعارات', exact: true })).toBeDisabled();
    expect(await iphone.evaluate(() => window.pushPermissionCalls)).toBe(0);
  } finally { await context.close(); }
});
test('logout clears the worker/device binding and the next account requires a fresh explicit opt-in', async ({ page }) => {
  await setup(page, 3); await enable(page);
  await page.evaluate(() => { window.fixtureSlowUnsubscribe = true; });
  await page.getByRole('button', { name: 'حسابي', exact: true }).click();
  await page.getByRole('button', { name: 'تسجيل الخروج من الحساب', exact: true }).click(); await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => sessionStorage.getItem('fixture-push-active'))).toBeNull();
  const initial = (await (await page.request.get('/api/auth/me')).json()).data;
  await page.request.post('/api/auth/login', { headers: { Origin: origin, 'X-CSRF-Token': initial.csrfToken }, data: { phone: '0597700004', password: 'PushBrowserFixture9!' } });
  await page.goto('/home'); await open(page);
  await expect(page.getByRole('status')).toHaveText('غير مفعّل'); expect(await page.evaluate(() => window.pushPermissionCalls)).toBe(0);
  await page.getByRole('button', { name: 'تفعيل الإشعارات', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('مفعّل');
});
test('trusted browser push events display fixed copy once, suppress revoked bindings, and never cache APIs', async ({ page, context }) => {
  await setup(page, 5); await enable(page);
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(() => { self.pushDisplays = []; self.registration.showNotification = async (title, options) => { self.pushDisplays.push({ title, options }); }; self.registration.getNotifications = async () => []; });
  const client = await context.newCDPSession(page);
  const registrations = [];
  client.on('ServiceWorker.workerRegistrationUpdated', ({ registrations: updates }) => registrations.push(...updates));
  await client.send('ServiceWorker.enable');
  await expect.poll(() => registrations.find((registration) => registration.scopeURL === origin + '/')?.registrationId).toBeTruthy();
  const registrationId = registrations.find((registration) => registration.scopeURL === origin + '/').registrationId;
  const binding = await page.evaluate(async () => { const response = await fetch('/api/notifications/subscription', { cache: 'no-store', headers: { 'X-Push-Device': localStorage.getItem('door-push-device') } }); return (await response.json()).data.binding; });
  const payload = { protocol: 1, type: 'schedule_published', eventId: 'a'.repeat(64), binding, expiresAt: Date.now() + 60000, url: 'https://evil.example', body: 'Untrusted content' };
  await client.send('ServiceWorker.deliverPushMessage', { origin, registrationId, data: JSON.stringify(payload) });
  await expect.poll(() => worker.evaluate(() => self.pushDisplays.length)).toBe(1);
  await client.send('ServiceWorker.deliverPushMessage', { origin, registrationId, data: JSON.stringify(payload) });
  expect(await worker.evaluate(() => self.pushDisplays[0].options.data.url)).toBe('/schedule');
  expect(await worker.evaluate(() => self.pushDisplays[0].options.body)).toContain('تم الإعلان عن موعد جديد');
  await page.getByRole('button', { name: 'إيقاف الإشعارات', exact: true }).click();
  await client.send('ServiceWorker.deliverPushMessage', { origin, registrationId, data: JSON.stringify({ ...payload, eventId: 'b'.repeat(64) }) });
  await page.evaluate(() => new Promise((resolve) => { const channel = new MessageChannel(); channel.port1.onmessage = resolve; navigator.serviceWorker.controller.postMessage({ type: 'PUSH_STATUS' }, [channel.port2]); }));
  expect(await worker.evaluate(() => self.pushDisplays.length)).toBe(1);
  const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (name) => (await (await caches.open(name)).keys()).map((request) => request.url)))).flat());
  for (const url of cached) expect(isPublicStaticUrl(new URL(url), origin)).toBe(true);
  await client.detach();
});
test('a failed server opt-out stays disabled locally and never rebinds automatically on revisit', async ({ page, context }) => {
  await setup(page, 6); await enable(page);
  let fail = true;
  await context.route('**/api/notifications/subscription', (route) => route.request().method() === 'DELETE' && fail
    ? route.fulfill({ status: 503, json: { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'تعذّر تأكيد الإيقاف.' } } }) : route.continue());
  await page.getByRole('button', { name: 'إيقاف الإشعارات', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('غير مفعّل');
  await expect(page.getByRole('alert')).toContainText('أُوقف عرض الإشعارات على الجهاز');
  expect(await page.evaluate(() => localStorage.getItem('door-push-disabled'))).toBe('pending');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('status')).toHaveText('غير مفعّل');
  fail = false; await page.getByRole('button', { name: 'إيقاف الإشعارات', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => window.pushPermissionCalls)).toBe(1);
});
