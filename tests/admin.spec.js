import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test.use({ timezoneId: 'America/Los_Angeles' });
const origin = 'http://127.0.0.1:4173';
async function login(page) {
  await page.goto('/admin/login');
  await page.getByLabel('رقم الهاتف', { exact: true }).fill('0594911111');
  await page.getByLabel('كلمة المرور', { exact: true }).fill('AdminBrowserPass9!');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'لوحة تحكم المجلس', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'إحصاءات المجلس' })).toBeVisible();
}

test('admin login has real branding, validation, hidden password, and RTL layouts at 390px and desktop', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole('heading', { name: 'تسجيل دخول المجلس' })).toBeVisible();
  await expect(page.getByRole('link', { name: /إنشاء/ })).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await mkdir('artifacts/screenshots', { recursive: true });
  for (const size of [{ name: 'mobile', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 1000 }]) {
    await page.setViewportSize(size);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => page.evaluate(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
    await page.screenshot({ path: `artifacts/screenshots/admin-login-${size.name}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page.getByText('يرجى إدخال رقم الهاتف', { exact: true })).toBeVisible();
  await page.getByLabel('رقم الهاتف', { exact: true }).fill('0594911111');
  await page.getByLabel('كلمة المرور', { exact: true }).fill('WrongPass9!');
  await page.getByRole('button', { name: 'إظهار كلمة المرور', exact: true }).click();
  await expect(page.getByLabel('كلمة المرور', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'إخفاء كلمة المرور', exact: true }).click();
  await expect(page.getByLabel('كلمة المرور', { exact: true })).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page.getByText('رقم الهاتف أو كلمة المرور غير صحيحين', { exact: true })).toBeVisible();
});

test('real admin dashboard, responsive sidebar/drawer, persistent session, and server logout', async ({ page, context, browser }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  await expect(page.locator('.admin-sidebar')).toBeVisible();
  await expect(page.locator('.admin-sidebar').getByRole('link', { name: 'الرئيسية' })).toHaveAttribute('aria-current', 'page');
  const response = await page.request.get('/api/admin/dashboard');
  expect(response.ok()).toBe(true);
  const data = (await response.json()).data;
  const stats = page.getByRole('region', { name: 'إحصاءات المجلس' });
  for (const [key, title] of [['registeredCitizens', 'المواطنون المسجلون'], ['activePumpingRounds', 'الضخ الحالي'], ['upcomingWaterRounds', 'الأدوار القادمة'], ['newReports', 'البلاغات الجديدة'], ['publishedAnnouncements', 'الإعلانات المنشورة']]) {
    await expect(stats.getByRole('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).locator('strong')).toHaveText(String(data.statistics[key]));
  }
  await expect(page.getByText('لا يوجد ضخ جارٍ حاليًا', { exact: true })).toBeVisible();
  await expect(page.getByText('لا توجد أدوار مياه مجدولة حاليًا', { exact: true })).toBeVisible();
  await expect(page.getByText('لا توجد بلاغات حاليًا', { exact: true })).toBeVisible();
  await mkdir('artifacts/screenshots', { recursive: true });
  for (const size of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }, { name: 'small-mobile', width: 320, height: 740 }, { name: 'tablet', width: 768, height: 1024 }]) {
    await page.setViewportSize(size);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/screenshots/admin-dashboard-${size.name}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.admin-topbar-profile').getByText('مسؤول اختبار المجلس', { exact: true })).toBeVisible();
  await expect(page.locator('.admin-topbar-profile').getByText('مسؤول المجلس', { exact: true })).toBeVisible();
  const menu = page.getByRole('button', { name: 'فتح قائمة المجلس' });
  await menu.click();
  const dialog = page.getByRole('dialog', { name: 'قائمة المجلس' });
  await expect(dialog).toBeVisible();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(dialog.getByRole('link', { name: 'الرئيسية' })).toHaveAttribute('aria-current', 'page');
  const placeholders = dialog.getByRole('navigation').getByRole('button');
  await expect(placeholders).toHaveCount(6);
  for (const item of await placeholders.all()) { await expect(item).toBeDisabled(); await expect(item).toContainText('قريبًا'); }
  await page.screenshot({ path: 'artifacts/screenshots/admin-drawer-mobile.png' });
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(menu).toBeFocused();
  await menu.click();
  await dialog.getByRole('link', { name: 'الرئيسية' }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('region', { name: 'إحصاءات المجلس' })).toBeVisible();
  const storage = await context.storageState();
  expect(storage.origins.flatMap((entry) => entry.localStorage)).toEqual([]);
  const restored = await browser.newContext({ storageState: storage });
  const otherPage = await restored.newPage();
  await otherPage.goto('/admin/login');
  await expect(otherPage).toHaveURL(/\/admin$/);
  await otherPage.getByRole('button', { name: 'تسجيل الخروج من المجلس', exact: true }).click();
  await expect(otherPage).toHaveURL(/\/admin\/login$/);
  await page.reload();
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect((await page.request.get('/api/admin/dashboard')).status()).toBe(401);
  await restored.close();
  expect(errors).toEqual([]);
});

test('citizen session survives admin-page visits and failed admin login, while admin API remains forbidden', async ({ page }) => {
  const me = (await (await page.request.get('/api/auth/me')).json()).data;
  const signed = await page.request.post('/api/auth/login', { headers: { Origin: origin, 'X-CSRF-Token': me.csrfToken }, data: { phone: '0594811111', password: 'ReportBrowser9!' } });
  expect(signed.status()).toBe(200);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect((await page.request.get('/api/admin/dashboard')).status()).toBe(403);
  await page.getByLabel('رقم الهاتف', { exact: true }).fill('0594811111');
  await page.getByLabel('كلمة المرور', { exact: true }).fill('ReportBrowser9!');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page.getByText('رقم الهاتف أو كلمة المرور غير صحيحين', { exact: true })).toBeVisible();
  await page.goto('/home');
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { name: 'أهلًا بك، مواطن اختبار البلاغات' })).toBeVisible();
});

test('dashboard loading errors recover and expired sessions remove protected content', async ({ page }) => {
  let fail = true;
  await page.route('**/api/admin/dashboard', (route) => fail ? route.fulfill({ status: 503, json: { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'الخدمة غير متاحة مؤقتًا.' } } }) : route.continue());
  await page.goto('/admin/login');
  await page.getByLabel('رقم الهاتف', { exact: true }).fill('0594911111');
  await page.getByLabel('كلمة المرور', { exact: true }).fill('AdminBrowserPass9!');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'تعذّر تحميل بيانات المجلس' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'إحصاءات المجلس' })).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await expect(page.getByRole('region', { name: 'إحصاءات المجلس' })).toBeVisible();
  const me = (await (await page.request.get('/api/auth/me')).json()).data;
  await page.request.post('/api/admin/logout', { headers: { Origin: origin, 'X-CSRF-Token': me.csrfToken }, data: {} });
  await page.getByRole('button', { name: 'تحديث البيانات', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole('region', { name: 'إحصاءات المجلس' })).toHaveCount(0);
});

test('populated dashboard renders multiple zones, unknown times, report statuses, and Palestine timestamps', async ({ page }) => {
  // Display fixtures only; statistics/query correctness uses real MongoDB integration tests.
  await page.route('**/api/admin/dashboard', async (route) => {
    const actual = await (await route.fetch()).json();
    const zone = { id: 'test-zone', name: 'حارة اختبار العرض' };
    const makeRound = (id, values = {}) => ({ id, zone, status: 'scheduled', scheduledDate: '2026-01-03', scheduledTime: null, actualStartedAt: null, updatedAt: '2026-01-02T22:30:00Z', ...values });
    await route.fulfill({ json: { success: true, data: { ...actual.data, generatedAt: '2026-01-02T22:30:00Z', statistics: { registeredCitizens: 23, activePumpingRounds: 2, upcomingWaterRounds: 6, newReports: 2, publishedAnnouncements: 4 }, activeRounds: [makeRound('active1', { status: 'pumping', actualStartedAt: '2026-01-02T22:00:00Z' }), makeRound('active2', { status: 'pumping', zone: { id: 'zone-2', name: 'الحارة الثانية' } })], upcomingRounds: [makeRound('next1'), makeRound('next2', { scheduledTime: '09:00' })], recentReports: [{ id: 'report1', type: 'water_problem', status: 'new', zone, createdAt: '2026-01-02T22:30:00Z' }], waterLastUpdatedAt: '2026-01-02T22:30:00Z' } } });
  });
  await login(page);
  await expect(page.getByText('الضخ جارٍ', { exact: true })).toBeVisible();
  await expect(page.getByText('لم يُسجّل وقت بدء الضخ', { exact: true })).toBeVisible();
  await expect(page.getByText(/اليوم · لم يتم تحديد الساعة بعد/)).toBeVisible();
  await expect(page.getByText(/اليوم · 9:00/)).toBeVisible();
  await expect(page.getByRole('cell', { name: 'مشكلة في المياه' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'جديد', exact: true })).toBeVisible();
  const expectedTime = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { timeZone: 'Asia/Hebron', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date('2026-01-02T22:30:00Z'));
  await expect(page.getByRole('cell', { name: expectedTime, exact: true })).toBeVisible();
  for (const size of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/screenshots/admin-dashboard-populated-display-fixture-${size.name}.png`, fullPage: true });
  }
});
