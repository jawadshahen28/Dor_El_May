import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { CHROME_SETUP_INTENT, SETUP_URL } from '../client/src/installation/flow.js';
import { emulateInstalledPwa } from './fixtures/installed-pwa.js';

const origin = 'http://127.0.0.1:4173';
const chrome = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36';
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1';
test.use({ viewport: { width: 390, height: 844 }, userAgent: chrome });

async function offerInstall(page, { outcome = 'accepted', pending = false, fail = false } = {}) {
  await page.evaluate(({ outcome, pending, fail }) => {
    window.installCalls = 0;
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = async () => { window.installCalls++; window.installHadUserGesture = navigator.userActivation.isActive; if (fail) throw new Error('Browser refused prompt'); };
    event.userChoice = pending ? new Promise(resolve => { window.confirmInstallChoice = () => resolve({ outcome }); }) : Promise.resolve({ outcome });
    window.dispatchEvent(event);
  }, { outcome, pending, fail });
}

test('both public entries expose sharing metadata before JS and legacy browser-test redirects safely', async ({ page }) => {
  for (const path of ['/download', '/setup']) {
    const response = await page.request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('<title>دور المي | مجلس قروي تلفيت</title>');
    expect(html).toContain('property="og:description"');
    expect(html).toContain('/images/talfit-council-logo.jpg');
    expect(html).toContain('rel="manifest"');
  }
  await page.goto('/browser-test?next=https://untrusted.example');
  await expect(page).toHaveURL(/\/download$/);
  expect((await page.request.get('/browser-test/browser-test.js')).status()).toBe(404);
});

test('Messenger handoff keeps the proven real anchor, targets setup, and remains usable when blocked', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: chrome + ' [FBAN/FB4A;FBAV/500.0]', viewport: { width: 390, height: 844 } });
  try {
    await context.addInitScript(() => {
      window.intentAttempts = [];
      document.addEventListener('click', event => {
        const anchor = event.target.closest('a[href^="intent:"]');
        if (anchor) { event.preventDefault(); window.intentAttempts.push(anchor.getAttribute('href')); }
      }, true);
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.copiedSetup = value; } } });
    });
    const page = await context.newPage();
    await page.goto(origin + '/download?url=https://untrusted.example');
    const action = page.getByRole('link', { name: 'الانتقال إلى تثبيت التطبيق', exact: true });
    await expect(action).toHaveAttribute('href', CHROME_SETUP_INTENT);
    await offerInstall(page);
    await expect(action).toHaveAttribute('href', CHROME_SETUP_INTENT);
    expect(await page.evaluate(() => window.intentAttempts)).toEqual([]);
    await expect(page.locator('.installation-village')).toHaveAttribute('src', '/images/talfit-village.jpg');
    await expect(page.locator('.installation-brand img')).toHaveAttribute('src', '/images/talfit-council-logo.jpg');
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.locator('form, .citizen-header, .admin-sidebar')).toHaveCount(0);
    await action.click();
    expect(await page.evaluate(() => window.intentAttempts)).toEqual([CHROME_SETUP_INTENT]);
    await expect(page).toHaveURL(/\/download\?/);
    await page.getByRole('button', { name: 'نسخ الرابط', exact: true }).click();
    expect(await page.evaluate(() => window.copiedSetup)).toBe(SETUP_URL);
    await expect(page.getByText('تم نسخ رابط التثبيت.', { exact: true })).toBeVisible();
    await page.locator('.installation-fallback summary').click();
    await expect(page.locator('.installation-fallback')).toContainText('قد يمنع التطبيق الحالي');
  } finally { await context.close(); }
});

test('external Chrome goes straight to setup and preserves one deferred prompt until the user clicks', async ({ page }) => {
  await page.goto('/download');
  const action = page.getByRole('link', { name: 'الانتقال إلى تثبيت التطبيق', exact: true });
  await expect(action).toHaveAttribute('href', '/setup');
  await offerInstall(page, { pending: true });
  await action.click();
  await expect(page).toHaveURL(/\/setup$/);
  const install = page.getByRole('button', { name: 'تثبيت التطبيق', exact: true });
  await expect(install).toBeVisible();
  expect(await page.evaluate(() => window.installCalls)).toBe(0);
  await expect(page.getByRole('complementary', { name: 'تثبيت دور المي' })).toHaveCount(0);
  await install.click();
  expect(await page.evaluate(() => window.installCalls)).toBe(1);
  expect(await page.evaluate(() => window.installHadUserGesture)).toBe(true);
  await expect(page.getByRole('button', { name: 'اتبع نافذة المتصفح…', exact: true })).toBeDisabled();
  await page.evaluate(() => window.confirmInstallChoice());
  await expect(page.getByText('تم قبول الطلب في المتصفح.', { exact: false })).toBeVisible();
  await expect(page.locator('.installation-confirmation')).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.locator('.installation-confirmation')).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/is-standalone/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/download$/);
});

for (const kind of ['dismissed', 'failed']) {
  test(`${kind} native prompt returns honest manual instructions without claiming installation`, async ({ page }) => {
    await page.goto('/setup');
    await expect(page.locator('.installation-manual')).toBeVisible();
    await offerInstall(page, { outcome: 'dismissed', fail: kind === 'failed' });
    await page.getByRole('button', { name: 'تثبيت التطبيق', exact: true }).click();
    await expect(page.locator('.installation-feedback')).toContainText(kind === 'failed' ? 'تعذّر فتح' : 'أُغلقت نافذة');
    await expect(page.locator('.installation-manual')).toBeVisible();
    await expect(page.locator('.installation-confirmation')).toHaveCount(0);
    expect(await page.evaluate(() => window.installCalls)).toBe(1);
  });
}

test('unavailable native prompt uses browser menu guidance, including on refresh', async ({ page }) => {
  await page.goto('/setup');
  await expect(page.getByRole('heading', { name: 'التثبيت من قائمة المتصفح', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'تثبيت التطبيق', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.installation-manual')).toContainText('إضافة إلى الشاشة الرئيسية');
  await expect(page).toHaveTitle('دور المي | مجلس قروي تلفيت');
});

for (const tablet of [false, true]) {
  test(`${tablet ? 'desktop-mode iPad' : 'iPhone'} uses Safari instructions and selected-link fallback without Android intents`, async ({ browser }) => {
    const context = await browser.newContext({ userAgent: tablet ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15' : iphone, viewport: { width: 390, height: 844 } });
    try {
      await context.addInitScript(tablet => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
        if (tablet) { Object.defineProperty(navigator, 'platform', { value: 'MacIntel' }); Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 }); }
      }, tablet);
      const page = await context.newPage();
      await page.goto(origin + '/download');
      await expect(page.locator('.installation-ios-note')).toContainText('Safari');
      await expect(page.locator('a[href^="intent:"]')).toHaveCount(0);
      await page.getByRole('link', { name: 'الانتقال إلى تثبيت التطبيق', exact: true }).click();
      await expect(page).toHaveURL(/\/setup$/);
      await expect(page.locator('.installation-manual')).toContainText('قائمة الصفحة');
      await expect(page.locator('.installation-manual')).toContainText('فتح كتطبيق ويب');
      await offerInstall(page);
      await expect(page.getByRole('button', { name: 'تثبيت التطبيق', exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => window.installCalls)).toBe(0);
      await page.getByRole('button', { name: 'نسخ الرابط', exact: true }).click();
      const field = page.getByRole('textbox', { name: 'رابط التثبيت للنسخ اليدوي', exact: true });
      await expect(field).toHaveValue(SETUP_URL);
      await expect(field).toBeFocused();
      expect(await field.evaluate(input => input.selectionEnd - input.selectionStart)).toBe(SETUP_URL.length);
    } finally { await context.close(); }
  });
}

test('ordinary browsers are routed from every citizen entry to the gateway without exposing app UI', async ({ page }) => {
  for (const path of ['/', '/login', '/register', '/guest', '/home', '/schedule', '/announcements', '/reports', '/account', '/notifications']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/download$/);
    await expect(page.locator('.installation-screen')).toBeVisible();
    await expect(page.locator('.citizen-header, .citizen-nav, form')).toHaveCount(0);
  }
  await page.goto('/install');
  await expect(page.locator('.empty-page .error-number')).toHaveText('404');
});

test('installed launch and installation URLs preserve the original authentication and citizen session', async ({ browser }) => {
  const context = await browser.newContext();
  await emulateInstalledPwa(context);
  try {
    const page = await context.newPage();
    for (const path of ['/', '/download', '/setup']) {
      await page.goto(origin + path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
    }
    const initial = (await (await context.request.get(origin + '/api/auth/me')).json()).data;
    expect((await context.request.post(origin + '/api/auth/login', { headers: { Origin: origin, 'X-CSRF-Token': initial.csrfToken }, data: { phone: '0596911111', password: 'PwaBrowserPass9!' } })).status()).toBe(200);
    await page.goto(origin + '/setup');
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('heading', { name: 'أهلًا بك، مواطن تثبيت أول', exact: true })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/home$/);
  } finally { await context.close(); }
});

test('a live standalone display-mode change leaves the gateway without an installation loop', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    const display = new EventTarget(); display.matches = false;
    window.matchMedia = query => query === '(display-mode: standalone)' ? display : original(query);
    window.enterInstalledWindow = () => { display.matches = true; display.dispatchEvent(new Event('change')); };
  });
  await page.goto('/download');
  await expect(page.locator('.installation-screen')).toBeVisible();
  await page.evaluate(() => window.enterInstalledWindow());
  await expect(page).toHaveURL(/\/login$/);
});

test('admin browser login/dashboard remain accessible and protected APIs still require real authorization', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole('heading', { name: 'تسجيل دخول المجلس', exact: true })).toBeVisible();
  expect((await page.request.get('/api/admin/dashboard')).status()).toBe(401);
  await page.getByLabel('رقم الهاتف', { exact: true }).fill('0594911111');
  await page.getByLabel('كلمة المرور', { exact: true }).fill('AdminBrowserPass9!');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'لوحة تحكم المجلس', exact: true })).toBeVisible();
  expect((await page.request.get('/api/admin/dashboard')).status()).toBe(200);
  await page.reload();
  await expect(page).toHaveURL(/\/admin$/);
});

test('both reference-based screens fit mobile/tablet/desktop and use only the real project assets', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mkdir('artifacts/screenshots', { recursive: true });
  for (const path of ['/download', '/setup']) {
    await page.goto(path);
    await expect(page.locator('.installation-screen')).toBeVisible();
    if (path === '/setup') await offerInstall(page);
    for (const width of [320, 360, 390, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect.poll(() => page.evaluate(() => [...document.images].every(image => image.complete && image.naturalWidth > 0))).toBe(true);
      await expect(page.locator('.installation-cta')).toBeInViewport();
      expect((await page.locator('.installation-cta').boundingBox()).height).toBeGreaterThanOrEqual(62);
      if ([320, 390, 1440].includes(width)) await page.screenshot({ path: `artifacts/screenshots/${path.slice(1)}-${width}.png`, fullPage: true });
    }
  }
  expect(errors).toEqual([]);
});
