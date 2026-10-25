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
const emptySchedule = (month, zone = 'mine') => ({ month, zone, status: null, activeRounds: [], rounds: [], pagination: { page: 1, pageSize: 50, total: 0, hasMore: false }, generatedAt: frozen, timeZone: 'Asia/Hebron' });

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

test('separate current/upcoming sections default to my neighborhood, retain pumping across months, and paginate only scheduled rows', async ({ page }) => {
  const { zones } = await citizen(page, '0594522222');
  await page.clock.setFixedTime(new Date(frozen));
  const fixture = (id, zone, status, date, time = '09:00') => ({ id, zone, status, scheduledDate: date, scheduledTime: time,
    actualStartedAt: status === 'pumping' ? '2026-01-31T22:00:00Z' : null });
  const active = [fixture('own-active', zones[0], 'pumping', '2025-12-31'), fixture('other-active', zones[1], 'pumping', '2026-01-01')];
  const rows = [fixture('own-today', zones[0], 'scheduled', '2026-02-01'), fixture('own-tomorrow', zones[0], 'scheduled', '2026-02-02', null),
    fixture('other-upcoming', zones[1], 'scheduled', '2026-02-03'), fixture('fourth', zones[4], 'scheduled', '2026-02-07')];
  const queries = [];
  await page.route('**/api/water-rounds?*', (route) => {
    const query = new URL(route.request().url()).searchParams; queries.push(Object.fromEntries(query));
    const month = query.get('month'), zone = query.get('zone'), pageNumber = Number(query.get('page'));
    const matches = (row) => zone === 'all' || row.zone.id === (zone === 'mine' ? zones[0].id : zone);
    const selected = month === '2026-02' ? rows.filter(matches) : [];
    const more = zone === 'all' && month === '2026-02';
    return route.fulfill({ json: { success: true, data: { ...emptySchedule(month, zone), activeRounds: active.filter(matches),
      rounds: pageNumber === 2 ? [fixture('extra', zones[4], 'scheduled', '2026-02-08')] : selected,
      pagination: { page: pageNumber, pageSize: 4, total: more ? 5 : selected.length, hasMore: more && pageNumber === 1 } } } });
  });
  await page.goto('/schedule');
  await expect(filters(page).getByRole('button', { name: 'حارتي', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(queries.at(-1).zone).toBe('mine');
  await expect(page.locator('.schedule-month-navigation time')).toHaveAttribute('datetime', '2026-02');
  await expect(page.getByRole('heading', { name: 'الضخ الجاري الآن', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'الأدوار القادمة', exact: true })).toBeVisible();
  await expect(page.locator('.schedule-pumping-card')).toHaveCount(1);
  await expect(page.locator('.schedule-row')).toHaveCount(2);
  await expect(page.locator('.schedule-row--mine')).toHaveCount(2);
  await expect(page.getByText('اليوم', { exact: true })).toBeVisible();
  await expect(page.getByText('غدًا', { exact: true })).toBeVisible();
  await expect(page.getByText('الساعة غير محددة', { exact: true })).toBeVisible();
  await expect(page.locator('.schedule-actual-start time')).toHaveAttribute('datetime', '2026-01-31T22:00:00Z');
  await expect(page.locator('.schedule-row').getByText('الضخ جارٍ الآن', { exact: true })).toHaveCount(0);
  for (const text of ['مكتمل', 'ملغي', 'ملغى', 'مسودة']) await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  await mkdir('artifacts/screenshots', { recursive: true });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 || width === 390 ? 1000 : 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'artifacts/screenshots/citizen-schedule-' + width + '.png', fullPage: true });
  }
  await filters(page).getByRole('button', { name: 'كل الحارات', exact: true }).click();
  await expect(page.locator('.schedule-pumping-card')).toHaveCount(2);
  await expect(page.locator('.schedule-row')).toHaveCount(4);
  await expect(page.locator('.schedule-row h3')).toHaveText(rows.map((row) => row.zone.name));
  await page.getByRole('button', { name: 'عرض المزيد من الأدوار', exact: true }).click();
  await expect(page.locator('.schedule-row')).toHaveCount(5);
  await expect(page.locator('.schedule-pumping-card')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'عرض المزيد من الأدوار', exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const lastRow = await page.locator('.schedule-row').last().boundingBox(), nav = await navigation(page).boundingBox();
  expect(lastRow.y + lastRow.height).toBeLessThan(nav.y);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('combobox', { name: 'حارة محددة', exact: true }).selectOption(zones[1].id);
  await expect(page.locator('.schedule-row')).toHaveCount(1);
  await expect(page.locator('.schedule-pumping-card')).toHaveCount(1);
  await expect(page.locator('.schedule-row--mine')).toHaveCount(0);
  expect(queries.at(-1).zone).toBe(zones[1].id);
  await page.getByRole('button', { name: 'الشهر السابق', exact: true }).click();
  await expect(page.getByText('لا توجد أدوار مياه معلنة لهذه الفترة', { exact: true })).toBeVisible();
  await expect(page.locator('.schedule-pumping-card')).toHaveCount(1);
  expect(queries.at(-1).month).toBe('2026-01');
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
  await expect(filters(page).getByRole('button')).toHaveCount(2); await expect(page.getByRole('combobox', { name: 'حارة محددة' }).getByRole('option')).toHaveCount(6);
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
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByRole('heading', { name: 'الإشعارات', exact: true })).toBeVisible();
  await page.goto('/schedule');
  await expect(page.getByText('لا توجد أدوار مياه معلنة لهذه الفترة', { exact: true })).toBeVisible();
  const me = (await (await page.request.get('/api/auth/me')).json()).data;
  await page.request.post('/api/auth/logout', { headers: { Origin: 'http://127.0.0.1:4173', 'X-CSRF-Token': me.csrfToken }, data: {} });
  await page.getByRole('button', { name: 'تحديث جدول المياه', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
