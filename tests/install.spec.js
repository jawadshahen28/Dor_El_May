import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { ANDROID_CHROME_INTENT, INSTALL_URL } from '../client/src/pwa/installation.js';

const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36';
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
test.use({ userAgent: android, viewport: { width: 390, height: 844 } });
test.beforeEach(async () => { await mkdir('artifacts/screenshots', { recursive: true }); });

async function offerInstall(page, { outcome = 'accepted', pending = false, fail = false } = {}) {
  await page.evaluate(({ outcome, pending, fail }) => {
    window.installPromptCalls = 0;
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = async () => { window.installPromptCalls++; if (fail) throw new Error('Simulated browser refusal'); };
    event.userChoice = pending ? new Promise(resolve => { window.resolveInstallChoice = () => resolve({ outcome }); }) : Promise.resolve({ outcome });
    window.dispatchEvent(event);
  }, { outcome, pending, fail });
}

test('public install page renders even while the session API is pending and refreshes without a login redirect', async ({ page }) => {
  await page.route('**/api/auth/me', () => {});
  await page.goto('/install');
  await expect(page.getByRole('heading', { name: 'ثبّت تطبيق دور المي', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/install$/);
  await expect(page).toHaveTitle(/تثبيت التطبيق/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.reload();
  await expect(page.getByRole('link', { name: 'الدخول إلى التطبيق', exact: true })).toHaveAttribute('href', '/');
  await expect(page.getByRole('complementary', { name: 'تثبيت دور المي' })).toHaveCount(0);
});

test('shared prompt survives navigation to install; a user click consumes it once and only appinstalled confirms installation', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
  await offerInstall(page, { pending: true });
  await page.evaluate(() => { history.pushState({}, '', '/install'); window.dispatchEvent(new PopStateEvent('popstate')); });
  const action = page.getByRole('button', { name: 'تثبيت التطبيق', exact: true });
  await expect(action).toBeVisible();
  await expect(action).toBeInViewport();
  expect(await page.evaluate(() => window.installPromptCalls)).toBe(0);
  await expect(page.getByRole('complementary', { name: 'تثبيت دور المي' })).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/screenshots/install-android.png', fullPage: true });
  await action.evaluate(button => { button.click(); button.click(); });
  expect(await page.evaluate(() => window.installPromptCalls)).toBe(1);
  await expect(page.getByRole('button', { name: 'اتبع نافذة المتصفح…', exact: true })).toBeDisabled();
  await page.evaluate(() => window.resolveInstallChoice());
  await expect(page.getByText('تم قبول طلبك في المتصفح.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'تم تأكيد طلب التثبيت' })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.getByRole('heading', { name: 'تم تأكيد طلب التثبيت' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'فتح التطبيق', exact: true })).toHaveAttribute('href', '/');
  await expect(page.getByRole('list', { name: 'خطوات تثبيت التطبيق' })).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/is-standalone/);
});

test('dismissal respects the shared preference and does not repeat the prompt during normal browsing', async ({ page }) => {
  await page.goto('/install');
  await expect(page.getByRole('heading', { name: 'ثبّت تطبيق دور المي', exact: true })).toBeVisible();
  await offerInstall(page, { outcome: 'dismissed' });
  await page.getByRole('button', { name: 'تثبيت التطبيق', exact: true }).click();
  await expect(page.getByText('أُغلقت نافذة التثبيت.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => Number(localStorage.getItem('door-pwa-install-dismissed-until')) > Date.now())).toBe(true);
  await page.getByRole('link', { name: 'الدخول إلى التطبيق', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await offerInstall(page);
  await expect(page.getByRole('complementary', { name: 'تثبيت دور المي' })).toHaveCount(0);
});

test('a refused browser prompt gives manual guidance without a false success', async ({ page }) => {
  await page.goto('/install');
  await expect(page.getByRole('heading', { name: 'ثبّت تطبيق دور المي', exact: true })).toBeVisible();
  await offerInstall(page, { fail: true });
  await page.getByRole('button', { name: 'تثبيت التطبيق', exact: true }).click();
  await expect(page.getByText('تعذّر فتح نافذة التثبيت.', { exact: false })).toBeVisible();
  await expect(page.getByRole('list', { name: 'خطوات تثبيت التطبيق' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'فتح التطبيق', exact: true })).toHaveCount(0);
});

test('Android without an event has real Chrome instructions and no pretend install button', async ({ page }) => {
  await page.goto('/install');
  await expect(page.getByRole('heading', { name: 'افتح الرابط في Chrome.', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'تثبيت التطبيق', exact: true })).toHaveCount(0);
  await expect(page.getByText('قد يختلف خيار التثبيت أو لا يظهر', { exact: false })).toBeVisible();
  await page.getByText('كيف أفتح في المتصفح؟', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'فتح في Chrome', exact: true })).toHaveAttribute('href', ANDROID_CHROME_INTENT);
});

test('known embedded browser offers a fixed intent; blocked external navigation keeps manual and copy fallbacks usable', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: android + ' [FBAN/FB4A;FBAV/500.0]', viewport: { width: 390, height: 844 } });
  try {
    await context.addInitScript(() => {
      window.externalAttempts = [];
      document.addEventListener('click', event => {
        const link = event.target.closest('a[href^="intent:"]');
        if (link) { event.preventDefault(); window.externalAttempts.push(link.getAttribute('href')); }
      }, true);
    });
    const page = await context.newPage();
    await page.goto('/install?next=https://untrusted.example&url=javascript:alert(1)');
    await expect(page.getByText('لتثبيت دور المي، افتح هذا الرابط في Chrome.', { exact: true })).toBeVisible();
    const external = page.getByRole('link', { name: 'فتح في Chrome', exact: true });
    await expect(external).toHaveAttribute('href', ANDROID_CHROME_INTENT);
    expect(await page.evaluate(() => window.externalAttempts)).toEqual([]);
    await page.screenshot({ path: 'artifacts/screenshots/install-android-embedded.png', fullPage: true });
    await external.click();
    expect(await page.evaluate(() => window.externalAttempts)).toEqual([ANDROID_CHROME_INTENT]);
    await expect(page.getByText('إذا لم يفتح Chrome، انسخ الرابط أدناه وافتحه من المتصفح بنفسك.', { exact: true })).toBeVisible();
    await expect(external).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'نسخ الرابط', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/install\?/);
    expect(await page.evaluate(() => window.externalAttempts.length)).toBe(1);
  } finally { await context.close(); }
});

test('unknown social webview gets the same capability fallback; available browser events take priority over app hints', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: android + ' UnlistedCouncilApp/1.0', viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto('/install');
    await page.getByText('كيف أفتح في المتصفح؟', { exact: true }).click();
    await expect(page.getByRole('link', { name: 'فتح في Chrome', exact: true })).toBeVisible();
    await offerInstall(page);
    await expect(page.getByRole('button', { name: 'تثبيت التطبيق', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'فتح في Chrome', exact: true })).toHaveCount(0);
  } finally { await context.close(); }
});

test('copy action uses the fixed HTTPS link and reports success only after copying', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedInstallLink = text; } }, configurable: true }));
  await page.goto('/install?url=https://untrusted.example');
  await page.getByRole('button', { name: 'نسخ الرابط', exact: true }).click();
  expect(await page.evaluate(() => window.copiedInstallLink)).toBe(INSTALL_URL);
  await expect(page.getByText('تم نسخ الرابط.', { exact: true })).toBeVisible();
});

test('denied clipboard access falls back to a selected copy buffer', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('Denied'); } }, configurable: true });
    document.execCommand = command => { window.legacyCopy = { command, value: document.activeElement.value, start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd }; return true; };
  });
  await page.goto('/install');
  await page.getByRole('button', { name: 'نسخ الرابط', exact: true }).click();
  expect(await page.evaluate(() => window.legacyCopy)).toEqual({ command: 'copy', value: INSTALL_URL, start: 0, end: INSTALL_URL.length });
  await expect(page.getByText('تم نسخ الرابط.', { exact: true })).toBeVisible();
  await expect(page.locator('.install-copy-buffer')).toHaveCount(0);
});

test('when all clipboard APIs fail the fixed link remains selectable with honest failure feedback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    document.execCommand = () => false;
  });
  await page.goto('/install');
  await page.getByRole('button', { name: 'نسخ الرابط', exact: true }).click();
  const link = page.getByRole('textbox', { name: 'رابط تثبيت التطبيق للنسخ اليدوي', exact: true });
  await expect(link).toHaveValue(INSTALL_URL);
  await expect(link).toBeFocused();
  expect(await link.evaluate(input => input.selectionEnd - input.selectionStart)).toBe(INSTALL_URL.length);
  await expect(page.getByText('تعذّر النسخ التلقائي.', { exact: false })).toBeVisible();
  await expect(page.getByText('تم نسخ الرابط.', { exact: true })).toHaveCount(0);
});

for (const embedded of [false, true]) {
  test(`iPhone ${embedded ? 'embedded browser' : 'Safari'} has five manual steps, modern Page Menu guidance and no Android actions`, async ({ browser }) => {
    const context = await browser.newContext({ userAgent: iphone + (embedded ? ' Instagram 350.0' : ''), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      const page = await context.newPage();
      await page.goto('/install');
      await expect(page.getByRole('heading', { name: 'تثبيت دور المي على الآيفون', exact: true })).toBeVisible();
      const steps = page.getByRole('list', { name: 'خطوات تثبيت التطبيق' });
      await expect(steps.getByRole('listitem')).toHaveCount(5);
      await expect(steps).toContainText('قائمة الصفحة');
      await expect(steps).toContainText('فتح كتطبيق ويب');
      await offerInstall(page);
      await expect(page.getByRole('button', { name: 'تثبيت التطبيق', exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => window.installPromptCalls)).toBe(0);
      await expect(page.locator('a[href^="intent:"]')).toHaveCount(0);
      if (embedded) await expect(page.getByText('افتح في Safari:', { exact: false })).toBeVisible();
      await page.screenshot({ path: `artifacts/screenshots/install-iphone${embedded ? '-embedded' : ''}.png`, fullPage: true });
    } finally { await context.close(); }
  });
}

for (const mode of ['ios', 'display-mode']) {
  test(`installed ${mode} execution shows only the app entry action and preserves the current session`, async ({ page }) => {
    await page.addInitScript(mode => {
      if (mode === 'ios') Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
      else {
        const original = window.matchMedia.bind(window);
        window.matchMedia = query => query.includes('display-mode: standalone') ? { matches: true, addEventListener() {}, removeEventListener() {} } : original(query);
      }
    }, mode);
    await page.goto('/install');
    await expect(page.getByRole('link', { name: 'فتح التطبيق', exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: 'خطوات تثبيت التطبيق' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'نسخ الرابط', exact: true })).toHaveCount(0);
    await expect(page.locator('html')).toHaveClass(/is-standalone/);
    await page.getByRole('link', { name: 'فتح التطبيق', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
}

test('authenticated visitors can use install without being redirected and return to their existing citizen session', async ({ page }) => {
  const origin = 'http://127.0.0.1:4173';
  const initial = (await (await page.request.get('/api/auth/me')).json()).data;
  const login = await page.request.post('/api/auth/login', { headers: { Origin: origin, 'X-CSRF-Token': initial.csrfToken }, data: { phone: '0596911111', password: 'PwaBrowserPass9!' } });
  expect(login.status()).toBe(200);
  await page.goto('/install');
  await expect(page.getByRole('heading', { name: 'ثبّت تطبيق دور المي', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/install$/);
  await page.getByRole('link', { name: 'الدخول إلى التطبيق', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { name: 'أهلًا بك، مواطن تثبيت أول', exact: true })).toBeVisible();
});

test('responsive RTL layout, images and touch targets work at all requested widths', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/install');
  await expect(page.getByRole('heading', { name: 'ثبّت تطبيق دور المي', exact: true })).toBeVisible();
  for (const width of [320, 360, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => page.evaluate(() => [...document.images].every(image => image.complete && image.naturalWidth > 0))).toBe(true);
    for (const control of await page.locator('.install-card button, .install-card > a, .install-browser-help summary').all()) {
      const bounds = await control.boundingBox();
      if (bounds) expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    if ([320, 390, 768, 1440].includes(width)) await page.screenshot({ path: `artifacts/screenshots/install-layout-${width}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});
