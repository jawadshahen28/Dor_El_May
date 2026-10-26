import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const website = 'https://dor-el-may-talfit-staging.onrender.com/';
const intent = 'intent://dor-el-may-talfit-staging.onrender.com/#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(website) + ';end';
const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36';
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1';
test.use({ userAgent: android, viewport: { width: 390, height: 844 } });

test('public standalone page refreshes without API/session requests and only targets the fixed website', async ({ page }) => {
  const apiRequests = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url()); });
  const response = await page.goto('/browser-test?next=https://untrusted.example');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/html');
  expect(response.headers()['cache-control']).toBe('no-store');
  expect(response.headers()['set-cookie']).toBeUndefined();
  await expect(page.getByRole('heading', { name: 'تجربة فتح Google Chrome', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('link', { name: 'فتح في Google Chrome', exact: true })).toHaveAttribute('href', intent);
  await expect(page.locator('#website-url')).toHaveValue(website);
  await expect(page.locator('link[rel="manifest"], #root')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#chrome-link')).toBeVisible();
  expect(apiRequests).toEqual([]);
});

test('intent runs only from the clicked anchor; a blocked handoff leaves copy and manual help usable', async ({ page }) => {
  await page.addInitScript(() => {
    window.intentClicks = [];
    document.addEventListener('click', event => {
      const anchor = event.target.closest('a[href^="intent:"]');
      if (anchor) { event.preventDefault(); window.intentClicks.push(anchor.getAttribute('href')); }
    }, true);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.copiedWebsite = value; } } });
  });
  await page.goto('/browser-test');
  await expect(page.locator('#chrome-link')).toBeVisible();
  expect(await page.evaluate(() => window.intentClicks)).toEqual([]);
  expect(await page.evaluate(() => window.copiedWebsite)).toBeUndefined();
  await page.locator('#chrome-link').click();
  expect(await page.evaluate(() => window.intentClicks)).toEqual([intent]);
  await expect(page).toHaveURL(/\/browser-test$/);
  await expect(page.locator('.browser-test-help')).toContainText('قد يمنع التطبيق الحالي');
  await page.getByRole('button', { name: 'نسخ الرابط', exact: true }).click();
  expect(await page.evaluate(() => window.copiedWebsite)).toBe(website);
  await expect(page.getByRole('status')).toHaveText('تم نسخ الرابط.');
  await expect(page.locator('#chrome-link')).toBeVisible();
});

for (const mode of ['denied', 'missing']) {
  test(`clipboard ${mode} leaves the fixed link selected for manual copying`, async ({ page }) => {
    await page.addInitScript(mode => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: mode === 'missing' ? undefined : { writeText: async () => { throw new Error('Denied'); } } }), mode);
    await page.goto('/browser-test');
    await page.getByRole('button', { name: 'نسخ الرابط', exact: true }).click();
    const field = page.getByRole('textbox', { name: 'رابط الموقع', exact: true });
    await expect(field).toHaveValue(website);
    await expect(field).toBeFocused();
    expect(await field.evaluate(input => input.selectionEnd - input.selectionStart)).toBe(website.length);
    await expect(page.getByRole('status')).toContainText('تعذّر النسخ التلقائي');
    await expect(page.getByRole('button', { name: 'نسخ الرابط', exact: true })).toBeEnabled();
  });
}

for (const device of ['iPhone', 'desktop-mode iPad']) {
  test(`${device} shows Safari guidance without any Android intent`, async ({ browser }) => {
    const context = await browser.newContext({ userAgent: device === 'iPhone' ? iphone : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', viewport: { width: 390, height: 844 } });
    try {
      if (device !== 'iPhone') await context.addInitScript(() => {
        Object.defineProperty(navigator, 'platform', { value: 'MacIntel' });
        Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 });
      });
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:4173/browser-test');
      await expect(page.locator('#safari-help')).toBeVisible();
      await expect(page.locator('#safari-help')).toContainText('Safari');
      await expect(page.locator('#chrome-link')).toBeHidden();
      await expect(page.locator('a[href^="intent:"]')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'نسخ الرابط', exact: true })).toBeVisible();
    } finally { await context.close(); }
  });
}

test('desktop visitors get manual browser guidance without an Android action', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36' });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4173/browser-test');
    await expect(page.locator('#other-device-help')).toBeVisible();
    await expect(page.locator('a[href^="intent:"]')).toHaveCount(0);
  } finally { await context.close(); }
});

test('temporary page fits mobile/desktop with large controls and no script errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/browser-test');
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const selector of ['#chrome-link', '#copy-link']) {
      await expect(page.locator(selector)).toBeVisible();
      expect((await page.locator(selector).boundingBox()).height).toBeGreaterThanOrEqual(52);
    }
    if (width === 390) {
      await mkdir('artifacts/screenshots', { recursive: true });
      await page.screenshot({ path: 'artifacts/screenshots/browser-test-android.png', fullPage: true });
    }
  }
  expect(errors).toEqual([]);
});

test('cancelled install page stays removed', async ({ page }) => {
  await page.goto('/install');
  await expect(page.locator('.empty-page .error-number')).toHaveText('404');
  await expect(page.locator('.install-page')).toHaveCount(0);
});
