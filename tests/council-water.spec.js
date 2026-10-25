import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

const origin = 'http://127.0.0.1:4173';
const date = '2095-06-15', month = '2095-06';
test.use({ timezoneId: 'America/Los_Angeles' });
async function login(page) {
  await page.clock.install({ time: new Date('2095-06-14T12:00:00Z') });
  await page.goto('/admin/login');
  await page.getByLabel('رقم الهاتف', { exact: true }).fill('0594933333');
  await page.getByLabel('كلمة المرور', { exact: true }).fill('CouncilBrowser9!');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
async function post(context, path, data, method = 'post') {
  const csrf = (await (await context.get('/api/auth/me')).json()).data.csrfToken;
  return context[method]('/api/admin/' + path, { headers: { Origin: origin, 'X-CSRF-Token': csrf }, data });
}
async function citizen(context) {
  const initial = (await (await context.request.get('/api/auth/me')).json()).data;
  const response = await context.request.post('/api/auth/login', { headers: { Origin: origin, 'X-CSRF-Token': initial.csrfToken }, data: { phone: '0594944444', password: 'CouncilBrowser9!' } });
  expect(response.status()).toBe(200);
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2095-06-14T12:00:00Z') });
  return page;
}
async function saveDraft(page, zoneId, time = '') {
  await page.getByLabel('الحارة', { exact: true }).selectOption(zoneId);
  await page.getByLabel('تاريخ الدور', { exact: true }).fill(date);
  await page.getByLabel('الساعة (اختياري)', { exact: true }).fill(time);
  const [response] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/admin/water-rounds') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'حفظ المسودة', exact: true }).click(),
  ]);
  expect(response.status()).toBe(201);
  const round = (await response.json()).data.round;
  await expect(page.locator(`[data-round-id="${round.id}"]`)).toContainText('مسودة');
  return round;
}
async function confirm(page, label) {
  const dialog = page.getByRole('dialog', { name: 'تأكيد ' + label, exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: label, exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
async function cleanup(context, ids) {
  const response = await context.get('/api/admin/water-rounds?month=' + month);
  if (!response.ok()) return;
  for (const round of (await response.json()).data.rounds.filter((round) => ids.includes(round.id))) {
    if (round.status === 'scheduled' || round.status === 'pumping') {
      const result = await post(context, `water-rounds/${round.id}/${round.status === 'pumping' ? 'end' : 'cancel'}`, { revision: round.revision });
      expect(result.ok()).toBe(true);
    }
  }
}

test('guest and citizen routes cannot expose the water management forms', async ({ page }) => {
  for (const path of ['/admin/water', '/admin/schedule']) { await page.goto(path); await expect(page).toHaveURL(/\/admin\/login$/); }
  await citizen(page.context());
  for (const path of ['/admin/water', '/admin/schedule']) {
    await page.goto(path); await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole('heading', { name: 'إنشاء دور مياه' })).toHaveCount(0);
  }
  expect((await page.request.get('/api/admin/water')).status()).toBe(403);
  expect((await page.request.get('/api/admin/water-rounds')).status()).toBe(403);
});

for (const size of [{ label: 'desktop', width: 1440, height: 1000 }, { label: 'mobile', width: 390, height: 844 }]) {
  test(`real draft-publication-pumping-completion workflow reaches citizen pages on ${size.label}`, async ({ page, browser }) => {
    const ids = [], errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize(size);
    await login(page);
    const readerContext = await browser.newContext({ baseURL: origin, serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
    try {
      const reader = await citizen(readerContext);
      const zones = (await (await page.request.get('/api/zones')).json()).data.zones;
      if (size.label === 'mobile') {
        await page.getByRole('button', { name: 'فتح قائمة المجلس' }).click();
        await page.getByRole('dialog', { name: 'قائمة المجلس' }).getByRole('link', { name: 'جدول المياه', exact: true }).click();
      } else await page.locator('.admin-sidebar').getByRole('link', { name: 'جدول المياه', exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/schedule$/);
      await expect(page.getByRole('heading', { name: 'إنشاء دور مياه', exact: true })).toBeVisible();
      const round = await saveDraft(page, zones[0].id); ids.push(round.id);
      expect(round.scheduledTime).toBeNull();
      await reader.goto('/schedule');
      const beforePublication = (await (await reader.request.get('/api/water-rounds?month=' + month)).json()).data.rounds;
      expect(beforePublication.map((item) => item.id)).not.toContain(round.id);
      const row = page.locator(`[data-round-id="${round.id}"]`);
      await row.getByRole('button', { name: 'نشر الدور', exact: true }).click();
      await confirm(page, 'نشر الدور');
      await expect(row).toContainText('مجدول');
      await expect(page.locator('#admin-main')).toBeFocused();
      await reader.getByRole('button', { name: 'تحديث جدول المياه', exact: true }).click();
      await expect(reader.locator('.schedule-row').filter({ hasText: zones[0].name }).last()).toContainText('مجدول');
      await reader.goto('/home');
      await expect(reader.getByRole('heading', { name: 'دور حارتي القادم', exact: true })).toBeVisible();
      const summary = (await (await reader.request.get('/api/home/summary')).json()).data;
      expect(summary.myNextRound.id).toBe(round.id); expect(summary.activeRounds).toEqual([]);
      await mkdir('artifacts/screenshots', { recursive: true });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `artifacts/screenshots/council-schedule-${size.label}.png`, fullPage: true });
      await page.goto('/admin/water');
      await page.getByLabel('الدور المنشور والمجدول', { exact: true }).selectOption(round.id);
      await page.getByRole('button', { name: 'بدء الضخ', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'تأكيد بدء الضخ' })).toContainText('وقت الخادم');
      await page.getByRole('dialog', { name: 'تأكيد بدء الضخ' }).getByRole('button', { name: 'رجوع', exact: true }).click();
      await expect(page.getByRole('button', { name: 'بدء الضخ', exact: true })).toBeFocused();
      expect((await (await page.request.get('/api/admin/water')).json()).data.activeRounds).toEqual([]);
      await page.getByRole('button', { name: 'بدء الضخ', exact: true }).click(); await confirm(page, 'بدء الضخ');
      const active = page.locator(`[data-round-id="${round.id}"]`);
      await expect(active).toContainText('بدأ الضخ فعليًا:');
      await reader.getByRole('button', { name: 'تحديث المعلومات', exact: true }).click();
      await expect(reader.getByText('الضخ جارٍ', { exact: true })).toBeVisible();
      expect((await (await reader.request.get('/api/home/summary')).json()).data.activeRounds[0].id).toBe(round.id);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `artifacts/screenshots/council-water-${size.label}.png`, fullPage: true });
      await active.getByRole('button', { name: 'إنهاء الضخ', exact: true }).click(); await confirm(page, 'إنهاء الضخ');
      await expect(page.getByText('لا يوجد ضخ جارٍ حاليًا', { exact: true })).toBeVisible();
      await expect(page.getByRole('region', { name: 'سجل الأدوار الأخيرة' }).getByText(zones[0].name, { exact: true }).first()).toBeVisible();
      await reader.getByRole('button', { name: 'تحديث المعلومات', exact: true }).click();
      await expect(reader.getByText('لا يوجد ضخ معلن حاليًا', { exact: true })).toBeVisible();
      await reader.goto('/schedule');
      await expect(reader.locator('.schedule-row').filter({ hasText: zones[0].name })).toHaveCount(0);
      await expect(reader.locator('.schedule-pumping-card').filter({ hasText: zones[0].name })).toHaveCount(0);
      const retained = (await (await page.request.get('/api/admin/water-rounds?month=' + month)).json()).data.rounds.find((item) => item.id === round.id);
      expect(retained.status).toBe('completed');
      expect(errors).toEqual([]);
    } finally { await cleanup(page.request, ids); await readerContext.close(); }
  });
}

test('admin validates dates, edits and cancels drafts, and keeps draft content private', async ({ page }) => {
  await login(page); await page.goto('/admin/schedule');
  const zones = (await (await page.request.get('/api/zones')).json()).data.zones;
  await page.getByRole('button', { name: 'حفظ المسودة', exact: true }).click();
  await expect(page.getByText('اختر حارة موجودة.', { exact: true })).toBeVisible();
  const round = await saveDraft(page, zones[1].id, '09:30');
  try {
    const row = page.locator(`[data-round-id="${round.id}"]`);
    await row.getByRole('button', { name: 'تعديل الدور', exact: true }).click();
    await page.getByLabel('الساعة (اختياري)', { exact: true }).fill('');
    await page.getByRole('button', { name: 'حفظ التعديلات', exact: true }).click();
    await expect(page.getByText('حُفظت تعديلات الدور. لم يتغير وقت بدء الضخ الفعلي.', { exact: true })).toBeVisible();
    await row.getByRole('button', { name: 'إلغاء الدور', exact: true }).click(); await confirm(page, 'إلغاء الدور');
    await expect(row).toContainText('ملغى');
    await page.getByLabel('حالة النشر', { exact: true }).selectOption('draft');
    await expect(row).toBeVisible();
  } finally { await cleanup(page.request, [round.id]); }
});

test('a stale pumping confirmation conflicts safely, refreshes state, and does not repeat the action', async ({ page }) => {
  await login(page);
  const zone = (await (await page.request.get('/api/zones')).json()).data.zones[0];
  const created = await post(page.request, 'water-rounds', { zoneId: zone.id, scheduledDate: date, requestId: randomUUID() });
  const draft = (await created.json()).data.round;
  try {
    const official = (await (await post(page.request, `water-rounds/${draft.id}/publish`, { revision: 0 })).json()).data.round;
    await page.goto('/admin/water');
    await page.getByLabel('الدور المنشور والمجدول', { exact: true }).selectOption(draft.id);
    await page.getByRole('button', { name: 'بدء الضخ', exact: true }).click();
    const winning = await post(page.request, `water-rounds/${draft.id}/start`, { revision: official.revision }); expect(winning.status()).toBe(200);
    const actualStartedAt = (await winning.json()).data.round.actualStartedAt;
    await confirm(page, 'بدء الضخ');
    await expect(page.getByRole('alert')).toContainText('تغيّر الدور أو نُفّذ الإجراء مسبقًا');
    const current = (await (await page.request.get('/api/admin/water')).json()).data.activeRounds.find((round) => round.id === draft.id);
    expect(current.revision).toBe(official.revision + 1); expect(current.actualStartedAt).toBe(actualStartedAt);
    await expect(page.locator(`[data-round-id="${draft.id}"]`).getByRole('button', { name: 'إنهاء الضخ', exact: true })).toBeVisible();
  } finally { await cleanup(page.request, [draft.id]); }
});

test('water management recovers from read errors and removes controls after session expiry', async ({ page }) => {
  await login(page);
  let fail = true;
  await page.route('**/api/admin/water?*', (route) => fail ? route.fulfill({ status: 503, json: { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'الخدمة غير متاحة مؤقتًا.' } } }) : route.continue());
  await page.goto('/admin/water');
  await expect(page.getByRole('heading', { name: 'تعذّر تحميل بيانات المجلس', exact: true })).toBeVisible();
  fail = false; await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await expect(page.getByRole('button', { name: 'بدء الضخ', exact: true })).toBeVisible();
  await post(page.request, 'logout', {});
  await page.getByRole('button', { name: 'تحديث البيانات', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole('button', { name: 'بدء الضخ', exact: true })).toHaveCount(0);
});
