import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { palestineDateTime, nextCalendarDate } from '../shared/waterTime.js';

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Los_Angeles' });
const origin = 'http://127.0.0.1:4173';
async function signIn(context, index) {
  const initial = (await (await context.request.get('/api/auth/me')).json()).data;
  const response = await context.request.post('/api/auth/login', { headers: { Origin: origin, 'X-CSRF-Token': initial.csrfToken }, data: { phone: `05978${String(index).padStart(5, '0')}`, password: 'InboxBrowser9!' } });
  expect(response.status()).toBe(200); return (await response.json()).data;
}
async function council(browser) {
  const context = await browser.newContext({ baseURL: origin });
  const initial = (await (await context.request.get('/api/auth/me')).json()).data;
  const response = await context.request.post('/api/admin/login', { headers: { Origin: origin, 'X-CSRF-Token': initial.csrfToken }, data: { phone: '0594933333', password: 'CouncilBrowser9!' } });
  expect(response.status()).toBe(200);
  const csrf = (await response.json()).data.csrfToken;
  const write = async (path, data) => { const result = await context.request.post('/api/admin/' + path, { headers: { Origin: origin, 'X-CSRF-Token': csrf }, data }); expect(result.ok()).toBe(true); return (await result.json()).data.round; };
  return { context, write };
}
async function publish(staff, zoneId, start = false) {
  const draft = await staff.write('water-rounds', { zoneId, scheduledDate: nextCalendarDate(palestineDateTime().date), requestId: randomUUID() });
  let round = await staff.write(`water-rounds/${draft.id}/publish`, { revision: 0 });
  if (start) round = await staff.write(`water-rounds/${round.id}/start`, { revision: round.revision });
  return round;
}

test('citizen without device permission sees real events, badge/read actions, persistence and responsive RTL design', async ({ page, browser }) => {
  await page.addInitScript(() => { window.permissionRequests = 0; window.Notification = class { static permission = 'denied'; static requestPermission() { window.permissionRequests++; return Promise.resolve('denied'); } }; });
  const citizen = await signIn(page.context(), 0), staff = await council(browser);
  try {
    await publish(staff, citizen.user.zone.id, true);
    await page.goto('/home'); await expect(page.locator('.inbox-bell-badge')).toHaveText('2');
    await page.getByRole('button', { name: 'الإشعارات', exact: true }).click(); await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByRole('heading', { name: 'الإشعارات', exact: true })).toBeVisible();
    await expect(page.locator('.inbox-item')).toHaveCount(2);
    await expect(page.locator('.inbox-item').first()).toContainText('بدأ ضخ المياه');
    await expect(page.locator('.inbox-item').last()).toContainText('غدًا دور المياه في الحارة الوسطى.');
    expect(await page.evaluate(() => window.permissionRequests)).toBe(0);
    await expect(page.getByRole('button', { name: 'تفعيل الإشعارات', exact: true })).toBeDisabled();
    await mkdir('artifacts/screenshots', { recursive: true });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `artifacts/screenshots/inbox-${width}.png`, fullPage: true });
    }
    await page.getByRole('button', { name: 'تحديد كمقروء', exact: true }).first().click();
    await expect(page.locator('.inbox-bell-badge')).toHaveText('1');
    await page.getByRole('button', { name: 'تحديد الكل كمقروء', exact: true }).click();
    await expect(page.locator('.inbox-bell-badge')).toHaveCount(0);
    await page.reload(); await expect(page.locator('.inbox-item')).toHaveCount(2); await expect(page.locator('.inbox-item--unread')).toHaveCount(0);
  } finally { await staff.context.close(); }
});
test('empty inbox, network failure and retry remain usable without requesting permission', async ({ page }) => {
  await signIn(page.context(), 5); let fail = true;
  await page.route('**/api/notifications/inbox', (route) => fail ? route.fulfill({ status: 503, json: { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'تعذّر تحميل الإشعارات الآن.' } } }) : route.continue());
  await page.goto('/notifications'); await expect(page.getByText('تعذّر تحميل الإشعارات', { exact: true })).toBeVisible();
  fail = false; await page.getByRole('button', { name: 'تحديث الإشعارات' }).click();
  await expect(page.getByText('كل أخبار المياه… ستجدها هنا', { exact: true })).toBeVisible();
  await expect(page.getByText('خلّيك على اطلاع بأخبار المياه')).toBeVisible();
  await page.screenshot({ path: 'artifacts/screenshots/inbox-empty.png', fullPage: true });
});
test('new events refresh on an explicit revisit, and opening a notification marks it read before the destination', async ({ page, browser }) => {
  const citizen = await signIn(page.context(), 5), staff = await council(browser);
  try {
    await page.goto('/notifications'); await expect(page.locator('.inbox-item')).toHaveCount(0);
    await publish(staff, citizen.user.zone.id);
    await page.getByRole('button', { name: 'تحديث الإشعارات' }).click();
    await expect(page.locator('.inbox-bell-badge')).toHaveText('1');
    await page.getByRole('link', { name: 'موعد دور المياه 💧', exact: true }).click();
    await expect(page).toHaveURL(/\/schedule$/); await expect(page.locator('.inbox-bell-badge')).toHaveCount(0);
    await page.getByRole('button', { name: 'الإشعارات', exact: true }).click(); await expect(page.locator('.inbox-item--unread')).toHaveCount(0);
  } finally { await staff.context.close(); }
});
