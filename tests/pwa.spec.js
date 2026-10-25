import { test, expect, chromium } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isPublicStaticUrl, STATIC_CACHE_PREFIX } from '../client/src/pwa/cachePolicy.js';

test.use({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });
const origin = 'http://127.0.0.1:4173';
async function controlled(page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
}
async function signIn(page, phone = '0596911111', admin = false) {
  await page.goto('/login');
  await controlled(page);
  const me = (await (await page.request.get('/api/auth/me')).json()).data;
  const response = await page.request.post(admin ? '/api/admin/login' : '/api/auth/login', {
    headers: { Origin: origin, 'X-CSRF-Token': me.csrfToken },
    data: { phone, password: admin ? 'AdminBrowserPass9!' : 'PwaBrowserPass9!' },
  });
  expect(response.status()).toBe(200);
  await page.goto(admin ? '/admin' : '/home');
  await controlled(page);
}
async function cacheSnapshot(page) {
  return page.evaluate(async () => Promise.all((await caches.keys()).map(async (name) => ({ name, urls: (await (await caches.open(name)).keys()).map((request) => request.url) }))));
}
async function assertStaticOnly(page) {
  const caches = await cacheSnapshot(page);
  expect(caches.length).toBeGreaterThan(0);
  for (const cache of caches) {
    expect(cache.name.startsWith(STATIC_CACHE_PREFIX)).toBe(true);
    for (const url of cache.urls) expect(isPublicStaticUrl(new URL(url), origin), url).toBe(true);
  }
}
async function offerInstall(page, outcome = 'dismissed') {
  await page.evaluate((choice) => {
    window.pwaPromptCalls = 0;
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = async () => { window.pwaPromptCalls++; };
    event.userChoice = Promise.resolve({ outcome: choice });
    window.dispatchEvent(event);
  }, outcome);
}

test('Chrome accepts the manifest and icons, registers the real worker, and caches only approved static assets', async () => {
  // Standard Playwright contexts are incognito, where installation is disabled.
  // Use a new isolated regular profile, never the user's Chrome profile.
  const profile = await mkdtemp(resolve('.cache/pwa-chrome-profile-'));
  const context = await chromium.launchPersistentContext(profile, { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true, serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });
  try {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await controlled(page);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const manifestResponse = await page.request.get('/manifest.webmanifest');
  expect(manifestResponse.headers()['content-type']).toContain('application/manifest+json');
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({ id: '/', name: 'دور المي – تلفيت', short_name: 'دور المي', start_url: '/', scope: '/', display: 'standalone', lang: 'ar', dir: 'rtl' });
  for (const icon of manifest.icons) {
    const response = await page.request.get(icon.src);
    expect(response.ok()).toBe(true);
    const bytes = await response.body();
    expect(bytes.readUInt32BE(16)).toBe(Number(icon.sizes.split('x')[0]));
    expect(bytes.readUInt32BE(20)).toBe(Number(icon.sizes.split('x')[1]));
  }
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon.png');
  const cdp = await context.newCDPSession(page);
  const app = await cdp.send('Page.getAppManifest');
  expect(app.errors).toEqual([]);
  const installability = await cdp.send('Page.getInstallabilityErrors');
  expect(installability.installabilityErrors).toEqual([]);
  const worker = await page.request.get('/sw.js');
  expect(worker.headers()['cache-control']).toBe('no-cache');
  expect(worker.headers()['service-worker-allowed']).toBe('/');
  await assertStaticOnly(page);
  expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('citizen data, auth, reports and administrator APIs are network-only; logout/account switching cannot reuse cached data', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'أهلًا بك، مواطن تثبيت أول' })).toBeVisible();
  const reads = await page.evaluate(async () => Promise.all(['/api/auth/me', '/api/home/summary', '/api/reports/mine', '/api/announcements', '/api/water-rounds', '/api/admin/dashboard'].map(async (path) => {
    const response = await fetch(path); return { path, status: response.status, cache: response.headers.get('Cache-Control') };
  })));
  for (const item of reads) { expect(item.cache).toBe('no-store'); expect(item.status).toBe(item.path.startsWith('/api/admin') ? 403 : 200); }
  await assertStaticOnly(page);
  await page.goto('/account');
  await expect(page.locator('.account-fields').getByText('مواطن تثبيت أول', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'تسجيل الخروج من الحساب', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, '0596922222');
  await expect(page.getByRole('heading', { name: 'أهلًا بك، مواطن تثبيت ثان' })).toBeVisible();
  await expect(page.getByText('مواطن تثبيت أول', { exact: true })).not.toBeVisible();
  await assertStaticOnly(page);
});

test('offline hides previous pumping/account data, supplies a cold-navigation fallback, and requires an explicit fresh retry', async ({ page, context }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'أهلًا بك، مواطن تثبيت أول' })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByRole('heading', { name: 'لا يوجد اتصال بالإنترنت', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'أهلًا بك، مواطن تثبيت أول' })).not.toBeVisible();
  const failure = await page.evaluate(async () => {
    const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    return { status: response.status, data: await response.json(), cache: response.headers.get('Cache-Control') };
  });
  expect(failure).toMatchObject({ status: 503, data: { success: false, error: { code: 'OFFLINE' } }, cache: 'no-store' });
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'لا يوجد اتصال بالإنترنت', exact: true })).toBeVisible();
  await expect(page.getByText('يرجى الاتصال بالإنترنت للحصول على أحدث معلومات ضخ المياه.', { exact: true })).toBeVisible();
  await assertStaticOnly(page);
  await mkdir('artifacts/screenshots', { recursive: true });
  await page.screenshot({ path: 'artifacts/screenshots/pwa-offline-mobile.png', fullPage: true });
  await context.setOffline(false);
  await expect(page.getByRole('heading', { name: 'لا يوجد اتصال بالإنترنت', exact: true })).toBeVisible();
  const fresh = page.waitForResponse((response) => response.url().endsWith('/api/auth/me') && response.ok());
  await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await fresh;
  await expect(page.locator('.account-fields').getByText('مواطن تثبيت أول', { exact: true })).toBeVisible();
});

test('administrator pages have the same safe offline fallback and no admin JSON enters the cache', async ({ page, context }) => {
  await signIn(page, '0594911111', true);
  await expect(page.getByRole('heading', { name: 'لوحة تحكم المجلس' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'إحصاءات المجلس' })).toBeVisible();
  await assertStaticOnly(page);
  await context.setOffline(true);
  await expect(page.getByRole('heading', { name: 'لا يوجد اتصال بالإنترنت', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'إحصاءات المجلس' })).not.toBeVisible();
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'لا يوجد اتصال بالإنترنت', exact: true })).toBeVisible();
  await assertStaticOnly(page);
});

test('eligible installation calls the browser event, persists dismissal, and never prompts a standalone app', async ({ page }) => {
  await page.goto('/login');
  await controlled(page);
  await offerInstall(page);
  const prompt = page.getByRole('complementary', { name: 'تثبيت دور المي' });
  await expect(prompt.getByText('ثبّت تطبيق دور المي على هاتفك', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/screenshots/pwa-install-mobile.png' });
  await prompt.getByRole('button', { name: 'تثبيت التطبيق', exact: true }).click();
  expect(await page.evaluate(() => window.pwaPromptCalls)).toBe(1);
  await expect(prompt).not.toBeVisible();
  expect(await page.evaluate(() => Number(localStorage.getItem('door-pwa-install-dismissed-until')) > Date.now())).toBe(true);
  await page.reload(); await offerInstall(page);
  await expect(prompt).not.toBeVisible();
  await page.evaluate(() => { localStorage.removeItem('door-pwa-install-dismissed-until'); Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }); });
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }));
  await page.reload(); await offerInstall(page);
  await expect(prompt).not.toBeVisible();
  await expect(page.locator('html')).toHaveClass(/is-standalone/);
  await signIn(page);
  const navigation = await page.getByRole('navigation', { name: 'التنقل الرئيسي' }).boundingBox();
  expect(Math.abs(navigation.y + navigation.height - 844)).toBeLessThan(2);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/screenshots/pwa-standalone-home-mobile.png', fullPage: true });
});

test('iPhone guidance is manual, accessible, dismissible and fits a 390px viewport', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', isMobile: true, hasTouch: true });
  await context.addInitScript(() => window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); event.stopImmediatePropagation(); }, true));
  const page = await context.newPage();
  await page.goto('/login');
  await controlled(page);
  await page.getByRole('button', { name: 'خطوات التثبيت', exact: true }).click({ timeout: 12000 });
  const dialog = page.getByRole('dialog', { name: 'تثبيت دور المي على iPhone' });
  await expect(dialog).toContainText('Safari');
  await expect(dialog).toContainText('إضافة إلى الشاشة الرئيسية');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/screenshots/pwa-iphone-instructions.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'إخفاء اقتراح التثبيت', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'تثبيت دور المي' })).not.toBeVisible();
  await context.close();
});

test('a real waiting worker prompts without reloading drafts; only explicit acceptance reloads its own tab', async ({ page, context }) => {
  await page.goto('/login'); await controlled(page);
  await page.getByLabel('رقم الهاتف', { exact: true }).fill('0596911111');
  const other = await context.newPage();
  await other.goto('/login'); await controlled(other);
  await other.getByLabel('رقم الهاتف', { exact: true }).fill('0596922222');
  await page.evaluate(async () => {
    for (let i = 0; i < 4; i++) await caches.open('door-el-may-static-v1-retained-test-' + i);
    // A different script URL creates a real update lifecycle using the built worker.
    await navigator.serviceWorker.register('/sw.js?pwa-test-revision=2', { scope: '/', updateViaCache: 'none' });
  });
  const notice = page.getByRole('complementary', { name: 'تحديث تطبيق دور المي' });
  await expect(notice.getByText('يتوفر تحديث جديد لتطبيق دور المي', { exact: true })).toBeVisible();
  await expect(page.getByLabel('رقم الهاتف', { exact: true })).toHaveValue('0596911111');
  await page.screenshot({ path: 'artifacts/screenshots/pwa-update-mobile.png' });
  page.once('dialog', (dialog) => dialog.dismiss());
  await notice.getByRole('button', { name: 'تحديث الآن', exact: true }).click();
  await expect(page.getByLabel('رقم الهاتف', { exact: true })).toHaveValue('0596911111');
  page.once('dialog', (dialog) => dialog.accept());
  await Promise.all([page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame() }), notice.getByRole('button', { name: 'تحديث الآن', exact: true }).click()]);
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
  await expect(other.getByLabel('رقم الهاتف', { exact: true })).toHaveValue('0596922222');
  await expect.poll(async () => (await cacheSnapshot(page)).length).toBeLessThanOrEqual(3);
  await other.close();
});
