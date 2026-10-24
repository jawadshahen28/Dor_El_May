import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test.use({ timezoneId: 'America/Los_Angeles' });
const frozen = '2026-01-31T22:30:00Z'; // February in Palestine; January in the device timezone.
async function citizen(page, phone) {
  const me = (await (await page.request.get('/api/auth/me')).json()).data;
  const zones = (await (await page.request.get('/api/zones')).json()).data.zones;
  const response = await page.request.post('/api/auth/register', {
    headers: { Origin: 'http://127.0.0.1:4173', 'X-CSRF-Token': me.csrfToken },
    data: { fullName: 'مواطن اختبار الجدول', phone, zoneId: zones[0].id, password: 'ScheduleBrowser9!', confirmPassword: 'ScheduleBrowser9!' },
  });
  expect(response.status()).toBe(201);
  return { user: (await response.json()).data.user, zones };
}
const navigation = (page) => page.getByRole('navigation', { name: 'التنقل الرئيسي' });
const filters = (page) => page.getByRole('group', { name: 'تصفية حسب الحارة' });
const emptySchedule = (month, zone = 'all') => ({ month, zone, status: null, rounds: [], pagination: { page: 1, pageSize: 50, total: 0, hasMore: false }, generatedAt: frozen, timeZone: 'Asia/Hebron' });

test('schedule is protected, all Home entries navigate correctly, and real empty data fits every viewport', async ({ page }) => {
  expect((await page.request.get('/api/water-rounds')).status()).toBe(401);
  await page.goto('/schedule');
  await expect(page).toHaveURL(/\/login$/);
  await citizen(page, '0594511111');
  await page.goto('/home');
  await expect(page.getByText('لا يوجد ضخ معلن حاليًا', { exact: true })).toBeVisible();
  const homeGeometry = await page.locator('.citizen-hero').boundingBox();
  const openers = [
    () => page.getByRole('button', { name: 'عرض جدول المياه كاملًا', exact: true }),
    () => page.getByRole('region', { name: 'وصول سريع', exact: true }).getByRole('button', { name: /جدول المياه/ }),
    () => navigation(page).getByRole('button', { name: 'جدول المياه', exact: true }),
  ];
  for (const opener of openers) {
    await opener().click();
    await expect(page).toHaveURL(/\/schedule$/);
    await expect(page.getByRole('heading', { name: 'جدول المياه', exact: true })).toBeVisible();
    await expect(navigation(page).getByRole('button', { name: 'جدول المياه', exact: true })).toHaveAttribute('aria-current', 'page');
    await navigation(page).getByRole('button', { name: 'الرئيسية', exact: true }).click();
    await expect(page).toHaveURL(/\/home$/);
    expect(await page.locator('.citizen-hero').boundingBox()).toEqual(homeGeometry);
    await expect(navigation(page).getByRole('button', { name: 'الرئيسية', exact: true })).toHaveAttribute('aria-current', 'page');
  }
  await page.goto('/schedule');
  await expect(page.getByRole('heading', { name: 'لا توجد أدوار مياه معلنة لهذه الفترة', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await mkdir('artifacts/screenshots', { recursive: true });
  for (const width of [320, 360, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/screenshots/water-schedule-empty-${width}.png`, fullPage: true });
    if (width < 768) {
      const nav = await navigation(page).boundingBox();
      expect(Math.abs(nav.y + nav.height - 844)).toBeLessThan(2);
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    if (width <= 768) {
      const nav = await navigation(page).boundingBox();
      const meta = await page.locator('.schedule-meta').boundingBox();
      expect(meta.y + meta.height).toBeLessThan(nav.y);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await page.reload();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByRole('heading', { name: 'لا توجد أدوار مياه معلنة لهذه الفترة', exact: true })).toBeVisible();
});

test('published display fixtures cover all statuses, own-zone highlights, month and zone filters, and pagination', async ({ page }) => {
  // These are isolated browser display fixtures, never official MongoDB records.
  const { zones } = await citizen(page, '0594522222');
  await page.clock.setFixedTime(new Date(frozen));
  const fixture = (id, zone, status, date, time = '09:00') => ({ id, zone, status, scheduledDate: date, scheduledTime: time, actualStartedAt: status === 'pumping' ? '2026-01-31T23:00:00Z' : null });
  const rows = [
    fixture('pumping', zones[1], 'pumping', '2026-02-01'),
    fixture('own', zones[0], 'scheduled', '2026-02-03'),
    fixture('completed', zones[2], 'completed', '2026-02-04'),
    fixture('cancelled', zones[3], 'cancelled', '2026-02-05'),
    fixture('unknown-time', zones[0], 'scheduled', '2026-02-06', null),
    fixture('sixth', zones[4], 'scheduled', '2026-02-07'),
  ];
  const queries = [];
  await page.route('**/api/water-rounds?*', (route) => {
    const query = new URL(route.request().url()).searchParams;
    queries.push(Object.fromEntries(query));
    const month = query.get('month'), zone = query.get('zone'), pageNumber = Number(query.get('page'));
    let selected = month === '2026-02' ? rows : [];
    if (zone !== 'all') selected = selected.filter((row) => row.zone.id === (zone === 'mine' ? zones[0].id : zone));
    const extra = pageNumber === 2 ? [fixture('extra', zones[4], 'scheduled', '2026-02-08')] : selected;
    const data = { ...emptySchedule(month, zone), rounds: extra, pagination: { page: pageNumber, pageSize: 6, total: zone === 'all' && month === '2026-02' ? 7 : selected.length, hasMore: pageNumber === 1 && zone === 'all' && month === '2026-02' } };
    return route.fulfill({ json: { success: true, data } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/schedule');
  await expect(page.locator('.schedule-month-navigation time')).toHaveAttribute('datetime', '2026-02');
  await expect(page.locator('.schedule-row')).toHaveCount(6);
  for (const status of ['مجدول', 'الضخ جارٍ', 'مكتمل', 'ملغي']) await expect(page.getByText(status, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('الساعة غير محددة', { exact: true })).toBeVisible();
  await expect(page.locator('.schedule-actual-start')).toContainText('بدأ الضخ فعليًا:');
  await expect(page.locator('.schedule-actual-start')).toContainText('1:00');
  await expect(page.locator('.schedule-row--mine')).toHaveCount(2);
  await expect(page.locator('.schedule-row--mine').first()).toContainText(zones[0].name);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [320, 360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/screenshots/water-schedule-test-data-${width}.png`, fullPage: true });
    if (width === 390) await page.screenshot({ path: 'artifacts/screenshots/water-schedule-reference-390.png' });
  }
  await page.getByRole('button', { name: 'عرض المزيد من الأدوار', exact: true }).click();
  await expect(page.locator('.schedule-row')).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'عرض المزيد من الأدوار', exact: true })).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const lastRow = await page.locator('.schedule-row').last().boundingBox();
  const nav = await navigation(page).boundingBox();
  expect(lastRow.y + lastRow.height).toBeLessThan(nav.y);
  await page.evaluate(() => window.scrollTo(0, 0));
  await filters(page).getByRole('button', { name: 'حارتي', exact: true }).click();
  await expect(page.locator('.schedule-row')).toHaveCount(2);
  await expect(filters(page).getByRole('button', { name: 'حارتي', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(queries.at(-1).zone).toBe('mine');
  await filters(page).getByRole('button', { name: zones[1].name, exact: true }).click();
  await expect(page.locator('.schedule-row')).toHaveCount(1);
  await expect(page.locator('.schedule-row--mine')).toHaveCount(0);
  expect(queries.at(-1).zone).toBe(zones[1].id);
  await page.getByRole('button', { name: 'الشهر السابق', exact: true }).click();
  await expect(page.getByText('لا توجد أدوار مياه معلنة لهذه الفترة', { exact: true })).toBeVisible();
  expect(queries.at(-1).month).toBe('2026-01');
  expect(queries.at(-1).zone).toBe(zones[1].id);
  await page.getByRole('button', { name: 'الشهر السابق', exact: true }).click();
  await expect(page.locator('.schedule-month-navigation time')).toHaveAttribute('datetime', '2025-12');
  await page.getByRole('button', { name: 'الشهر التالي', exact: true }).click();
  await expect(page.locator('.schedule-month-navigation time')).toHaveAttribute('datetime', '2026-01');
  await page.getByRole('button', { name: 'العودة للشهر الحالي', exact: true }).click();
  await expect(page.locator('.schedule-month-navigation time')).toHaveAttribute('datetime', '2026-02');
  await expect(page.locator('.schedule-row')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('schedule loading, API failure, retry, stale refresh notice and filter changes remain honest', async ({ page }) => {
  const { zones } = await citizen(page, '0594533333');
  await page.clock.setFixedTime(new Date(frozen));
  let calls = 0;
  await page.route('**/api/water-rounds?*', async (route) => {
    calls++;
    const month = new URL(route.request().url()).searchParams.get('month');
    if (calls === 1) await new Promise((resolve) => setTimeout(resolve, 500));
    if (calls !== 2) return route.fulfill({ status: 503, json: { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'تعذّر تحميل البيانات مؤقتًا.' } } });
    return route.fulfill({ json: { success: true, data: { ...emptySchedule(month), rounds: [{ id: 'isolated-stale-test', zone: zones[0], scheduledDate: `${month}-10`, scheduledTime: null, status: 'scheduled', actualStartedAt: null }] } } });
  });
  await page.goto('/schedule');
  await expect(page.getByRole('status', { name: 'جارٍ تحميل جدول المياه' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'تعذّر تحميل جدول المياه', exact: true })).toBeVisible();
  await expect(page.getByText('لا توجد أدوار مياه معلنة لهذه الفترة', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await expect(page.locator('.schedule-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'تحديث جدول المياه', exact: true }).click();
  await expect(page.getByText(/المعروض من آخر تحميل ناجح لهذه التصفية/)).toBeVisible();
  await expect(page.locator('.schedule-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'الشهر التالي', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'تعذّر تحميل جدول المياه', exact: true })).toBeVisible();
  await expect(page.locator('.schedule-row')).toHaveCount(0);
});

test('delayed month responses cannot overwrite a newer filter, and zone list errors can be retried', async ({ page }) => {
  await citizen(page, '0594544444');
  await page.clock.setFixedTime(new Date(frozen));
  let zoneCalls = 0;
  await page.route('**/api/zones', (route) => ++zoneCalls === 1
    ? route.fulfill({ status: 503, json: { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'تعذّر تحميل الحارات مؤقتًا.' } } })
    : route.continue());
  let delayed = false, delayedDone = false;
  await page.route('**/api/water-rounds?*', async (route) => {
    const month = new URL(route.request().url()).searchParams.get('month');
    if (month === '2026-03') { delayed = true; await new Promise((resolve) => setTimeout(resolve, 650)); }
    await route.fulfill({ json: { success: true, data: emptySchedule(month) } });
    if (month === '2026-03') delayedDone = true;
  });
  await page.goto('/schedule');
  await expect(page.getByText(/تعذّر تحميل قائمة الحارات/)).toBeVisible();
  await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await expect(filters(page).getByRole('button')).toHaveCount(7);
  await page.getByRole('button', { name: 'الشهر التالي', exact: true }).click();
  await expect.poll(() => delayed).toBe(true);
  await page.getByRole('button', { name: 'الشهر التالي', exact: true }).click();
  await expect(page.locator('.schedule-month-navigation time')).toHaveAttribute('datetime', '2026-04');
  await expect(page.getByText('لا توجد أدوار مياه معلنة لهذه الفترة', { exact: true })).toBeVisible();
  await expect(page.locator('.schedule-results')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => delayedDone).toBe(true);
  await expect(page.locator('.schedule-month-navigation time')).toHaveAttribute('datetime', '2026-04');
});

test('expired sessions leave the schedule and account navigation and notification placeholder remain usable', async ({ page }) => {
  await citizen(page, '0594555555');
  await page.goto('/schedule');
  await expect(page.getByText('لا توجد أدوار مياه معلنة لهذه الفترة', { exact: true })).toBeVisible();
  await navigation(page).getByRole('button', { name: 'حسابي', exact: true }).click();
  await expect(page.locator('.account-fields').getByText('مواطن اختبار الجدول', { exact: true })).toBeVisible();
  await navigation(page).getByRole('button', { name: 'جدول المياه', exact: true }).click();
  await page.getByRole('button', { name: 'الإشعارات', exact: true }).click();
  await expect(page.getByRole('dialog').getByText(/خدمة الإشعارات قيد التجهيز/)).toBeVisible();
  await page.getByRole('button', { name: 'إغلاق', exact: true }).click();
  const me = (await (await page.request.get('/api/auth/me')).json()).data;
  await page.request.post('/api/auth/logout', { headers: { Origin: 'http://127.0.0.1:4173', 'X-CSRF-Token': me.csrfToken }, data: {} });
  await page.getByRole('button', { name: 'تحديث جدول المياه', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
