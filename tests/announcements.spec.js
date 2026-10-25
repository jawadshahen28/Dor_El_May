import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test.use({ timezoneId: 'America/Los_Angeles' });
const publication = '2026-01-31T22:30:00Z'; // February 1, 00:30 in Palestine.
const firstId = '200000000000000000000001';
const secondId = '200000000000000000000002';
const thirdId = '200000000000000000000003';
const nav = (page) => page.getByRole('navigation', { name: 'التنقل الرئيسي' });
const empty = (view = 'all') => ({ announcements: [], view, recentDays: 30, pagination: { page: 1, pageSize: 10, total: 0, hasMore: false }, generatedAt: publication, timeZone: 'Asia/Hebron' });
async function citizen(page, phone) {
  const me = (await (await page.request.get('/api/auth/me')).json()).data;
  const response = await page.request.post('/api/auth/login', {
    headers: { Origin: 'http://127.0.0.1:4173', 'X-CSRF-Token': me.csrfToken },
    data: { phone, password: 'AnnouncementBrowser9!' },
  });
  expect(response.status()).toBe(200);
}

test('protected real empty feed, Home entry points, shared navigation and existing page geometry stay correct', async ({ page }) => {
  for (const path of ['/api/announcements', `/api/announcements/${firstId}`]) expect((await page.request.get(path)).status()).toBe(401);
  await page.goto('/announcements');
  await expect(page).toHaveURL(/\/login$/);
  await citizen(page, '0594611111');
  await page.goto('/home');
  await expect(page.getByText('لا يوجد ضخ معلن حاليًا', { exact: true })).toBeVisible();
  const home = await page.locator('.citizen-hero').boundingBox();
  const entries = [
    () => page.getByRole('link', { name: 'آخر إعلانات المجلس', exact: true }),
    () => page.getByRole('button', { name: 'عرض جميع الإعلانات', exact: true }),
    () => page.getByRole('region', { name: 'وصول سريع', exact: true }).getByRole('button', { name: /إعلانات المجلس/ }),
  ];
  for (const entry of entries) {
    await entry().click();
    await expect(page).toHaveURL(/\/announcements$/);
    await expect(page.getByRole('heading', { name: 'إعلانات المجلس', exact: true })).toBeVisible();
    await expect(page.getByText('لا توجد إعلانات جديدة حاليًا', { exact: true })).toBeVisible();
    await expect(nav(page).getByRole('button')).toHaveCount(4);
    await nav(page).getByRole('button', { name: 'الرئيسية', exact: true }).click();
    await expect(page).toHaveURL(/\/home$/);
    expect(await page.locator('.citizen-hero').boundingBox()).toEqual(home);
  }
  await nav(page).getByRole('button', { name: 'جدول المياه', exact: true }).click();
  await expect(page.getByText('لا توجد أدوار مياه معلنة لهذه الفترة', { exact: true })).toBeVisible();
  const schedule = await page.locator('.schedule-month-navigation').boundingBox();
  await page.goto('/announcements');
  await nav(page).getByRole('button', { name: 'جدول المياه', exact: true }).click();
  await expect(page.getByText('لا توجد أدوار مياه معلنة لهذه الفترة', { exact: true })).toBeVisible();
  expect(await page.locator('.schedule-month-navigation').boundingBox()).toEqual(schedule);
  await page.goto('/announcements');
  await expect(page.getByText('ستظهر هنا إعلانات مجلس قروي تلفيت فور نشرها.', { exact: true })).toBeVisible();
  await mkdir('artifacts/screenshots', { recursive: true });
  for (const width of [320, 360, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => page.evaluate(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
    await page.screenshot({ path: `artifacts/screenshots/announcements-empty-${width}.png`, fullPage: true });
    if (width === 390) await page.screenshot({ path: 'artifacts/screenshots/announcements-empty-reference-390.png' });
    if (width < 768) {
      const navigation = await nav(page).boundingBox();
      expect(Math.abs(navigation.y + navigation.height - 844)).toBeLessThan(2);
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    if (width <= 768) {
      const identity = await page.getByRole('region', { name: 'هوية مجلس قروي تلفيت' }).boundingBox();
      const navigation = await nav(page).boundingBox();
      expect(identity.y + identity.height).toBeLessThan(navigation.y);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await page.reload();
  await expect(page).toHaveURL(/\/announcements$/);
  await expect(page.getByText('لا توجد إعلانات جديدة حاليًا', { exact: true })).toBeVisible();
});

test('isolated display fixtures support recent filtering, pagination, long RTL content, details and safe plain text', async ({ page }) => {
  // These fixtures are browser responses only. They are not Council records.
  await citizen(page, '0594622222');
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const first = { id: firstId, title: 'إعلان لاختبار العرض والقراءة فقط', excerpt: 'هذا النص لاختبار تنسيق بطاقات إعلانات المجلس في بيئة معزولة.\nتظهر هنا معاينة واضحة، ويمكن قراءة النص كاملًا من صفحة الإعلان.', publishedAt: publication };
  const second = { id: secondId, title: 'عنوان طويل لاختبار التفاف النص العربي داخل بطاقات الإعلانات ' .repeat(2).trim(), excerpt: 'نص معاينة طويل لاختبار سهولة القراءة على الشاشات الصغيرة. '.repeat(8), publishedAt: '2026-01-30T10:00:00Z' };
  const third = { id: thirdId, title: 'إعلان اختبار لدفعة إضافية', excerpt: 'سجل عرض إضافي لاختبار زر المزيد فقط.', publishedAt: '2025-12-01T10:00:00Z' };
  const content = `${first.excerpt}\n\nفقرة ثانية تحافظ على الأسطر وعلامات الترقيم، دون تفسير HTML.\n<script>window.announcementScript=true</script>\n<img src=x onerror="window.announcementScript=true">\n\n${'تفاصيل نصية لاختبار القراءة والوصول إلى نهاية الإعلان. '.repeat(40)}`;
  const queries = [];
  await page.route('**/api/announcements?*', (route) => {
    const search = new URL(route.request().url()).searchParams;
    const view = search.get('view'), pageNumber = Number(search.get('page'));
    queries.push({ view, page: pageNumber });
    const rows = view === 'recent' ? [first] : pageNumber === 1 ? [first, second] : [third];
    return route.fulfill({ json: { success: true, data: { ...empty(view), announcements: rows, pagination: { page: pageNumber, pageSize: 2, total: view === 'recent' ? 1 : 3, hasMore: view === 'all' && pageNumber === 1 } } } });
  });
  await page.route(`**/api/announcements/${firstId}`, (route) => route.fulfill({ json: { success: true, data: { announcement: { ...first, content }, timeZone: 'Asia/Hebron' } } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/announcements');
  await expect(page.locator('.announcement-card')).toHaveCount(2);
  await expect(page.locator('.announcement-card').first().locator('time')).toContainText('1 شباط 2026');
  await expect(page.locator('.announcement-card img')).toHaveCount(0);
  await expect(page.getByText('هام', { exact: true })).not.toBeVisible();
  for (const width of [320, 360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/screenshots/announcements-test-data-${width}.png`, fullPage: true });
    if (width === 390) await page.screenshot({ path: 'artifacts/screenshots/announcements-reference-390.png' });
  }
  await page.getByRole('button', { name: 'عرض المزيد من الإعلانات', exact: true }).click();
  await expect(page.locator('.announcement-card')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'عرض المزيد من الإعلانات', exact: true })).not.toBeVisible();
  expect(queries.at(-1).page).toBe(2);
  await page.getByRole('button', { name: 'الأحدث', exact: true }).click();
  await expect(page).toHaveURL(/\?view=recent$/);
  await expect(page.getByText('الإعلانات المنشورة خلال آخر 30 يومًا', { exact: true })).toBeVisible();
  await expect(page.locator('.announcement-card')).toHaveCount(1);
  expect(queries.at(-1).view).toBe('recent');
  await page.getByRole('link', { name: `قراءة المزيد: ${first.title}`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/announcements/${firstId}$`));
  await expect(page.getByRole('heading', { name: first.title, exact: true })).toBeVisible();
  await expect(page.locator('.announcement-body')).toHaveText(content);
  await expect(page.locator('.announcement-body')).toHaveCSS('white-space', 'pre-wrap');
  await expect(page.locator('.announcement-body script, .announcement-body img')).toHaveCount(0);
  expect(await page.evaluate(() => window.announcementScript)).toBeUndefined();
  await expect(page.locator('.announcement-published time')).toContainText('1 شباط 2026');
  await expect(page.locator('.announcement-published time')).toContainText('12:30');
  await expect(page).toHaveTitle(`${first.title} — دور المي، تلفيت`);
  for (const width of [320, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/screenshots/announcement-details-test-data-${width}.png`, fullPage: true });
    if (width === 390) await page.screenshot({ path: 'artifacts/screenshots/announcement-details-reference-390.png' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const identity = await page.getByRole('region', { name: 'هوية مجلس قروي تلفيت' }).boundingBox();
  const navigation = await nav(page).boundingBox();
  expect(identity.y + identity.height).toBeLessThan(navigation.y);
  await page.getByRole('link', { name: 'العودة إلى الإعلانات', exact: true }).click();
  await expect(page).toHaveURL(/\/announcements\?view=recent$/);
  await expect(page.locator('.announcement-card')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('feed loading, initial failure, retry, pagination failure and manual refresh keep honest states', async ({ page }) => {
  await citizen(page, '0594633333');
  let calls = 0;
  const item = { id: firstId, title: 'سجل اختبار أخطاء الاتصال', excerpt: 'نص عرض معزول.', publishedAt: publication };
  await page.route('**/api/announcements?*', async (route) => {
    calls++;
    const pageNumber = Number(new URL(route.request().url()).searchParams.get('page'));
    if (calls === 1) await new Promise((resolve) => setTimeout(resolve, 500));
    if ([1, 3, 5].includes(calls)) return route.fulfill({ status: 503, json: { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'تعذّر الاتصال مؤقتًا.' } } });
    return route.fulfill({ json: { success: true, data: { ...empty(), announcements: [{ ...item, id: pageNumber === 1 ? firstId : secondId }], pagination: { page: pageNumber, pageSize: 1, total: 2, hasMore: pageNumber === 1 } } } });
  });
  await page.goto('/announcements');
  await expect(page.getByRole('status', { name: 'جارٍ تحميل إعلانات المجلس' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'تعذّر تحميل الإعلانات', exact: true })).toBeVisible();
  await expect(page.getByText('لا توجد إعلانات جديدة حاليًا', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await expect(page.locator('.announcement-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'عرض المزيد من الإعلانات', exact: true }).click();
  await expect(page.getByText(/المعروض من آخر تحميل ناجح لهذه التصفية/)).toBeVisible();
  await expect(page.locator('.announcement-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'عرض المزيد من الإعلانات', exact: true }).click();
  await expect(page.locator('.announcement-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'تحديث الإعلانات', exact: true }).click();
  await expect(page.getByText(/المعروض من آخر تحميل ناجح لهذه التصفية/)).toBeVisible();
  await expect(page.locator('.announcement-card')).toHaveCount(2);
});

test('a delayed recent response cannot overwrite a new filter, and filter failures never show other results', async ({ page }) => {
  await citizen(page, '0594644444');
  let started = false, finished = false;
  await page.route('**/api/announcements?*', async (route) => {
    const view = new URL(route.request().url()).searchParams.get('view');
    if (view === 'recent') { started = true; await new Promise((resolve) => setTimeout(resolve, 600)); }
    await route.fulfill({ json: { success: true, data: { ...empty(view), announcements: view === 'recent' ? [{ id: firstId, title: 'استجابة اختبار قديمة', excerpt: 'لا يجب أن تظهر بعد تغيير التصفية.', publishedAt: publication }] : [] } } });
    if (view === 'recent') finished = true;
  });
  await page.goto('/announcements');
  await expect(page.getByText('لا توجد إعلانات جديدة حاليًا', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'الأحدث', exact: true }).click();
  await expect.poll(() => started).toBe(true);
  await page.getByRole('button', { name: 'جميع الإعلانات', exact: true }).click();
  await expect.poll(() => finished).toBe(true);
  await expect(page.getByText('لا توجد إعلانات جديدة حاليًا', { exact: true })).toBeVisible();
  await expect(page.getByText('استجابة اختبار قديمة', { exact: true })).not.toBeVisible();
});

test('details retry works, and withdrawn, missing and malformed announcements have safe not-found states', async ({ page }) => {
  await citizen(page, '0594655555');
  let calls = 0;
  await page.route(`**/api/announcements/${firstId}`, async (route) => {
    calls++;
    if (calls === 1) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return route.fulfill({ status: 503, json: { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'تعذّر تحميل الإعلان مؤقتًا.' } } });
    }
    if (calls > 2) return route.fulfill({ status: 404, json: { success: false, error: { code: 'ANNOUNCEMENT_NOT_FOUND', message: 'الإعلان غير متاح أو لم يعد منشورًا.' } } });
    return route.fulfill({ json: { success: true, data: { announcement: { id: firstId, title: 'إعلان اختبار سحب النشر', content: 'نص سيُزال عند تلقي 404.', publishedAt: publication } } } });
  });
  await page.goto(`/announcements/${firstId}`);
  await expect(page.getByRole('status', { name: 'جارٍ تحميل الإعلان' })).toBeVisible();
  await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'إعلان اختبار سحب النشر', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'تحديث الإعلان', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'الإعلان غير متاح', exact: true })).toBeVisible();
  await expect(page.locator('.announcement-body')).toHaveCount(0);
  for (const id of ['not-an-id', thirdId]) {
    await page.goto(`/announcements/${id}`);
    await expect(page.getByRole('heading', { name: 'الإعلان غير متاح', exact: true })).toBeVisible();
  }
  await page.getByRole('link', { name: 'العودة إلى الإعلانات', exact: true }).click();
  await expect(page).toHaveURL(/\/announcements$/);
});

test('announcement session expiry clears protected content and shared placeholders remain usable', async ({ page }) => {
  await citizen(page, '0594666666');
  await page.goto('/announcements');
  await expect(page.getByText('لا توجد إعلانات جديدة حاليًا', { exact: true })).toBeVisible();
  await nav(page).getByRole('button', { name: 'حسابي', exact: true }).click();
  await expect(page.locator('.account-fields').getByText('مواطن اختبار الإعلانات', { exact: true })).toBeVisible();
  await page.goBack();
  await page.getByRole('button', { name: 'الإشعارات', exact: true }).click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByRole('heading', { name: 'الإشعارات', exact: true })).toBeVisible();
  await page.goto('/announcements');
  await expect(page.getByText('لا توجد إعلانات جديدة حاليًا', { exact: true })).toBeVisible();
  const me = (await (await page.request.get('/api/auth/me')).json()).data;
  await page.request.post('/api/auth/logout', { headers: { Origin: 'http://127.0.0.1:4173', 'X-CSRF-Token': me.csrfToken }, data: {} });
  await page.getByRole('button', { name: 'تحديث الإعلانات', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
