import { test, expect } from './fixtures/installed-pwa.js';
import { mkdir } from 'node:fs/promises';

test.use({ timezoneId: 'America/Los_Angeles' });
const origin = 'http://127.0.0.1:4173';
const nav = (page) => page.getByRole('navigation', { name: 'التنقل الرئيسي' });
async function citizen(page, phone) {
  const me = (await (await page.request.get('/api/auth/me')).json()).data;
  const response = await page.request.post('/api/auth/login', { headers: { Origin: origin, 'X-CSRF-Token': me.csrfToken }, data: { phone, password: 'ReportBrowser9!' } });
  expect(response.status()).toBe(200);
  return (await response.json()).data.user;
}
async function noOverflow(page) { await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }

test('private citizen pages, all four tabs, real profile, empty reports and mobile forms fit the approved app', async ({ page }) => {
  test.setTimeout(60000);
  expect((await page.request.get('/api/reports/mine')).status()).toBe(401);
  for (const path of ['/reports', '/account']) { await page.goto(path); await expect(page).toHaveURL(/\/login$/); }
  const user = await citizen(page, '0594811111');
  await page.goto('/home');
  await expect(page.getByText('لا يوجد ضخ معلن حاليًا', { exact: true })).toBeVisible();
  const home = await page.locator('.citizen-hero').boundingBox();
  await page.getByRole('button', { name: /تقديم شكوى/ }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(nav(page).getByRole('button', { name: 'البلاغات', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('لم تقم بإرسال أي بلاغات بعد', { exact: true })).toBeVisible();
  await nav(page).getByRole('button', { name: 'جدول المياه', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'جدول المياه', exact: true })).toBeVisible();
  await nav(page).getByRole('button', { name: 'الرئيسية', exact: true }).click();
  await expect(page.getByText('لا يوجد ضخ معلن حاليًا', { exact: true })).toBeVisible();
  expect(await page.locator('.citizen-hero').boundingBox()).toEqual(home);
  await page.getByRole('button', { name: 'فتح حسابي', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(nav(page).getByRole('button', { name: 'حسابي', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.account-fields').getByText(user.fullName, { exact: true })).toBeVisible();
  await expect(page.locator('.account-fields').getByText(user.phone, { exact: true })).toBeVisible();
  await expect(page.locator('.account-fields').getByText(user.zone.name, { exact: true })).toBeVisible();
  await expect(page.locator('.account-fields time')).toHaveAttribute('datetime', user.createdAt);
  await expect(page.getByText('للمساعدة في تغيير كلمة المرور، تواصل مع مجلس قروي تلفيت.', { exact: true })).toBeVisible();
  await expect(page.getByRole('switch')).toHaveCount(0);
  await expect(page.locator('input')).toHaveCount(0);
  await mkdir('artifacts/screenshots', { recursive: true });
  for (const width of [320, 360, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    for (const [route, label] of [['reports', 'البلاغات'], ['account', 'حسابي']]) {
      await nav(page).getByRole('button', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${route}$`));
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await noOverflow(page);
      if (route === 'account') await expect(page.locator('.account-fields')).toBeVisible();
      else await expect(page.getByText('لم تقم بإرسال أي بلاغات بعد', { exact: true })).toBeVisible();
      await page.screenshot({ path: `artifacts/screenshots/citizen-${route}-${width}.png`, fullPage: true });
      if (width === 390) await page.screenshot({ path: `artifacts/screenshots/citizen-${route}-reference-390.png` });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      if (width <= 768) {
        const footer = await page.locator('.workspace-footer .council-signature').boundingBox();
        const navigation = await nav(page).boundingBox();
        expect(footer.y + footer.height).toBeLessThan(navigation.y);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  }
  await nav(page).getByRole('button', { name: 'البلاغات', exact: true }).click();
  await page.getByRole('button', { name: 'تقديم بلاغ جديد', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('radio')).toHaveCount(3);
  await expect(dialog.getByText(`الحارة: ${user.zone.name}`, { exact: true })).toBeVisible();
  await expect(dialog.getByRole('combobox')).toHaveCount(0);
  await dialog.getByRole('radio', { name: 'مشكلة في المياه', exact: true }).check();
  const description = dialog.getByRole('textbox', { name: /تفاصيل البلاغ/ });
  await expect(description).toBeEmpty();
  await expect(description).toHaveAttribute('maxlength', '2000');
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow(page);
    await expect.poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/screenshots/citizen-report-form-${width}.png` });
  }
  await dialog.getByRole('button', { name: 'إغلاق نموذج البلاغ', exact: true }).click();
  await nav(page).getByRole('button', { name: 'حسابي', exact: true }).click();
  await page.getByRole('button', { name: 'تسجيل الخروج من الحساب', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get('/api/reports/mine')).status()).toBe(401);
  expect((await (await page.request.get('/api/auth/me')).json()).data.user).toBeNull();
  for (const path of ['/reports', '/account']) { await page.goto(path); await expect(page).toHaveURL(/\/login$/); }
});

test('real reports validate, save once during repeated clicks, persist and display safe expandable details', async ({ page }) => {
  await citizen(page, '0594822222');
  let posts = 0, submittedBody;
  await page.route('**/api/reports', async (route) => {
    posts++;
    submittedBody = route.request().postDataJSON();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });
  await page.goto('/reports');
  await page.getByRole('button', { name: 'تقديم بلاغ جديد', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'إرسال البلاغ', exact: true }).click();
  await expect(dialog.getByText('يرجى اختيار نوع البلاغ', { exact: true })).toBeVisible();
  expect(posts).toBe(0);
  await dialog.getByRole('radio', { name: 'مشكلة في المياه', exact: true }).check();
  await dialog.getByRole('button', { name: 'إرسال البلاغ', exact: true }).click();
  await expect(dialog.getByText('يرجى وصف المشكلة في تفاصيل البلاغ', { exact: true })).toBeVisible();
  const description = 'بلاغ اختبار معزول لتسريب المياه.\n\n<script>window.reportScript=true</script>';
  await dialog.getByRole('textbox', { name: /تفاصيل البلاغ/ }).fill(description);
  await dialog.locator('form').evaluate((form) => { form.requestSubmit(); form.requestSubmit(); });
  await expect(dialog.getByRole('button', { name: 'يرجى الانتظار…', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'تم إرسال بلاغك بنجاح', exact: true })).toBeVisible();
  await expect(page.getByText('تم تسجيل بلاغك، ويمكنك متابعة حالته من بلاغاتي السابقة.', { exact: true })).toBeVisible();
  await expect(page.locator('.report-history-card')).toHaveCount(1);
  expect(posts).toBe(1);
  expect(Object.keys(submittedBody).sort()).toEqual(['description', 'submissionId', 'type']);
  await expect(page.locator('.report-status')).toHaveText('جديد');
  await page.locator('.report-details summary').click();
  await expect(page.locator('.report-details > p')).toHaveText(description);
  await expect(page.locator('.report-details script')).toHaveCount(0);
  expect(await page.evaluate(() => window.reportScript)).toBeUndefined();
  await page.reload();
  await expect(page.locator('.report-history-card')).toHaveCount(1);
  for (const label of ['وصلت المياه لحارتي', 'لم تصل المياه لحارتي']) {
    await page.getByRole('button', { name: 'تقديم بلاغ جديد', exact: true }).click();
    await dialog.getByRole('radio', { name: label, exact: true }).check();
    await expect(dialog.getByRole('textbox', { name: /تفاصيل البلاغ/ })).toBeEmpty();
    await dialog.getByRole('button', { name: 'إرسال البلاغ', exact: true }).click();
    await expect(dialog).not.toBeVisible();
  }
  await expect(page.locator('.report-history-card')).toHaveCount(3);
  const stored = (await (await page.request.get('/api/reports/mine')).json()).data.reports;
  expect(new Set(stored.map((item) => item.type)).size).toBe(3);
  expect(stored.every((item) => item.status === 'new')).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/screenshots/citizen-reports-submitted-test-data-390.png', fullPage: true });
});

test('a lost response can be retried safely without saving a second report', async ({ page }) => {
  await citizen(page, '0594833333');
  const ids = [];
  await page.route('**/api/reports', async (route) => {
    ids.push(route.request().postDataJSON().submissionId);
    if (ids.length === 1) { expect((await route.fetch()).status()).toBe(201); await route.abort('failed'); }
    else await route.continue();
  });
  await page.goto('/reports');
  await page.getByRole('button', { name: 'تقديم بلاغ جديد', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: 'وصلت المياه لحارتي', exact: true }).check();
  await dialog.getByRole('button', { name: 'إرسال البلاغ', exact: true }).click();
  await expect(dialog.getByText(/تعذّر الاتصال بالخدمة/)).toBeVisible();
  await dialog.getByRole('button', { name: 'إرسال البلاغ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'تم إرسال بلاغك بنجاح', exact: true })).toBeVisible();
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  await expect(page.locator('.report-history-card')).toHaveCount(1);
  expect((await (await page.request.get('/api/reports/mine')).json()).data.pagination.total).toBe(1);
});

test('report states and pagination, profile retry, and failed logout remain recoverable', async ({ page }) => {
  await citizen(page, '0594844444');
  const me = (await (await page.request.get('/api/auth/me')).json()).data.user;
  let calls = 0;
  // Explicit browser display fixtures only; no reports are seeded in any app database.
  await page.route('**/api/reports/mine?*', async (route) => {
    calls++;
    if (calls === 1) { await new Promise((resolve) => setTimeout(resolve, 500)); return route.fulfill({ status: 503, json: { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'البلاغات غير متاحة مؤقتًا.' } } }); }
    const pageNumber = Number(new URL(route.request().url()).searchParams.get('page'));
    const rows = pageNumber === 1 ? ['new', 'reviewing', 'resolved', 'closed'].map((status, index) => ({ id: `test-${index}`, type: 'arrived', description: 'وصف مخصص لاختبار عرض الحالات فقط.', status, zone: me.zone, createdAt: '2026-01-31T22:30:00Z' })) : [{ id: 'test-extra', type: 'not_arrived', description: '', status: 'new', zone: me.zone, createdAt: '2026-01-30T12:00:00Z' }];
    return route.fulfill({ json: { success: true, data: { reports: rows, pagination: { page: pageNumber, pageSize: 4, total: 5, hasMore: pageNumber === 1 } } } });
  });
  await page.goto('/reports');
  await expect(page.getByRole('status', { name: 'جارٍ تحميل بلاغاتك' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'تعذّر تحميل بلاغاتك', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await expect(page.locator('.report-history-card')).toHaveCount(4);
  for (const status of ['جديد', 'قيد المراجعة', 'تمت المعالجة', 'مغلق']) await expect(page.getByText(status, { exact: true })).toBeVisible();
  await expect(page.locator('.report-history-meta time').first()).toContainText('1 شباط 2026');
  await page.getByRole('button', { name: 'عرض المزيد من بلاغاتي', exact: true }).click();
  await expect(page.locator('.report-history-card')).toHaveCount(5);
  let accountCalls = 0;
  await page.route('**/api/auth/me', async (route) => {
    accountCalls++;
    if (accountCalls === 1) { await new Promise((resolve) => setTimeout(resolve, 500)); return route.fulfill({ status: 503, json: { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'تعذّر تحميل الحساب مؤقتًا.' } } }); }
    return route.continue();
  });
  await nav(page).getByRole('button', { name: 'حسابي', exact: true }).click();
  await expect(page.getByRole('status', { name: 'جارٍ تحميل معلومات حسابك' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'تعذّر تحميل معلومات الحساب', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await expect(page.locator('.account-fields').getByText(me.phone, { exact: true })).toBeVisible();
  let logoutCalls = 0;
  await page.route('**/api/auth/logout', (route) => ++logoutCalls === 1 ? route.fulfill({ status: 503, json: { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'تعذّر تسجيل الخروج مؤقتًا.' } } }) : route.continue());
  await page.getByRole('button', { name: 'تسجيل الخروج من الحساب', exact: true }).click();
  await expect(page.getByText('تعذّر تسجيل الخروج مؤقتًا.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole('button', { name: 'تسجيل الخروج من الحساب', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
