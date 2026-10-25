import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Date displays must follow Palestine even when the browser uses a different timezone.
test.use({ timezoneId: 'America/Los_Angeles' });

async function citizen(page, phone) {
  const me = await (await page.request.get('/api/auth/me')).json();
  const zones = (await (await page.request.get('/api/zones')).json()).data.zones;
  const response = await page.request.post('/api/auth/register', {
    headers: { Origin: 'http://127.0.0.1:4173', 'X-CSRF-Token': me.data.csrfToken },
    data: { fullName: 'مواطن اختبار', phone, zoneId: zones[0].id, password: 'HomeBrowser9!', confirmPassword: 'HomeBrowser9!' },
  });
  expect(response.status()).toBe(201);
  return { user: (await response.json()).data.user, zones };
}

test('citizen home uses the real summary API, displays honest empty states, and fits mobile/tablet/desktop', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await citizen(page, '0594111111');
  await page.goto('/home');
  await expect(page.getByRole('heading', { name: 'أهلًا بك، مواطن اختبار' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'ترحيب ومعلومات الحارة' }).getByText('الحارة الوسطى', { exact: true })).toBeVisible();
  for (const text of ['لا يوجد ضخ معلن حاليًا', 'لم يتم الإعلان عن موعد دور حارتك القادم', 'لم يتم الإعلان عن أدوار قادمة', 'لا توجد إعلانات جديدة حاليًا']) await expect(page.getByText(text, { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await mkdir('artifacts/screenshots', { recursive: true });
  for (const size of [{ name: 'mobile', width: 390, height: 844 }, { name: 'mobile-360', width: 360, height: 800 }, { name: 'mobile-414', width: 414, height: 896 }, { name: 'mobile-430', width: 430, height: 932 }, { name: 'small-mobile', width: 320, height: 740 }, { name: 'tablet', width: 768, height: 1024 }, { name: 'desktop', width: 1440, height: 1000 }]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect.poll(() => page.evaluate(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
    const nav = await page.getByRole('navigation', { name: 'التنقل الرئيسي' }).boundingBox();
    if (size.width < 768) expect(Math.abs(nav.y + nav.height - size.height)).toBeLessThan(2);
    await page.screenshot({ path: `artifacts/screenshots/citizen-home-${size.name}.png`, fullPage: true });
    if (size.width === 390) {
      await page.screenshot({ path: 'artifacts/screenshots/citizen-home-reference-390.png' });
      const hero = await page.locator('.citizen-hero').boundingBox();
      const welcome = await page.getByRole('region', { name: 'ترحيب ومعلومات الحارة' }).boundingBox();
      const current = await page.getByRole('region', { name: 'وين المياه شغالة حاليًا؟', exact: true }).boundingBox();
      expect(welcome.y + welcome.height).toBeLessThanOrEqual(hero.y + hero.height + 1);
      expect(current.y).toBeLessThanOrEqual(hero.y + hero.height + 16);
    }
    if (size.width <= 768) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const navigation = await page.getByRole('navigation', { name: 'التنقل الرئيسي' }).boundingBox();
      const footerBrand = await page.locator('.citizen-footer .council-signature').boundingBox();
      const quickActions = await page.getByRole('region', { name: 'وصول سريع', exact: true }).boundingBox();
      expect(footerBrand.y + footerBrand.height).toBeLessThanOrEqual(navigation.y);
      expect(quickActions.y + quickActions.height).toBeLessThanOrEqual(navigation.y);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'عرض جدول المياه كاملًا', exact: true }).click();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByRole('heading', { name: 'جدول المياه', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'التنقل الرئيسي' }).getByRole('button', { name: 'الرئيسية', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole('button', { name: /تقديم شكوى/ }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole('heading', { name: 'البلاغات', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'التنقل الرئيسي' }).getByRole('button', { name: 'الرئيسية', exact: true }).click();
  await page.getByRole('button', { name: 'الإشعارات', exact: true }).click();
  await expect(page.getByRole('dialog').getByText(/خدمة الإشعارات غير مهيأة على الخادم/)).toBeVisible();
  await page.getByRole('button', { name: 'إغلاق', exact: true }).click();
  await page.getByRole('button', { name: 'حسابي', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.locator('.account-fields').getByText('مواطن اختبار', { exact: true })).toBeVisible();
  await expect(page.locator('.account-fields').getByText('0594111111', { exact: true })).toBeVisible();
  await expect(errors).toEqual([]);
});

test('home renders multiple active zones, own upcoming round, announcement text, and Palestine dates on a foreign-timezone device', async ({ page }) => {
  // Mock display fixtures only; backend query behavior is tested against real MongoDB separately.
  const { user, zones } = await citizen(page, '0594222222');
  const generatedAt = '2026-01-02T22:30:00Z';
  const makeRound = (id, zone, values = {}) => ({ id, zone, scheduledDate: '2026-01-03', scheduledTime: '09:00', status: 'scheduled', actualStartedAt: null, actualEndedAt: null, publishedAt: '2026-01-02T12:00:00Z', updatedAt: generatedAt, ...values });
  const upcoming = [makeRound('upcoming-own', zones[0]), makeRound('upcoming-second', zones[1], { scheduledTime: null }), makeRound('upcoming-third', zones[2], { scheduledDate: '2026-01-04' })];
  const summary = {
    user, zone: user.zone, generatedAt, timeZone: 'Asia/Hebron', waterLastUpdatedAt: generatedAt,
    activeRounds: [makeRound('active-first', zones[1], { status: 'pumping', actualStartedAt: '2026-01-02T21:00:00Z' }), makeRound('active-second', zones[2], { status: 'pumping' })],
    myNextRound: upcoming[0], upcomingRounds: upcoming,
    latestAnnouncement: { id: '100000000000000000000001', title: 'إعلان اختبار العرض', content: 'هذا محتوى مخصص لاختبار الواجهة محليًا. <script>window.unwantedScript=true</script>', publishedAt: '2026-01-02T20:00:00Z' },
  };
  await page.route('**/api/home/summary', (route) => route.fulfill({ json: { success: true, data: summary } }));
  await page.route('**/api/announcements/100000000000000000000001', (route) => route.fulfill({ json: { success: true, data: { announcement: summary.latestAnnouncement, timeZone: 'Asia/Hebron' } } }));
  await page.goto('/home');
  const current = page.getByRole('region', { name: 'وين المياه شغالة حاليًا؟', exact: true });
  await expect(current.getByText('الضخ جارٍ', { exact: true })).toBeVisible();
  await expect(current.getByRole('heading', { name: zones[1].name, exact: true })).toBeVisible();
  await expect(current.getByRole('heading', { name: zones[2].name, exact: true })).toBeVisible();
  const next = page.getByRole('region', { name: 'دور حارتي القادم', exact: true });
  await expect(next.getByText('اليوم', { exact: true })).toBeVisible();
  await expect(next.getByText(/9:00/)).toBeVisible();
  await expect(page.getByRole('listitem', { name: `${zones[0].name}، حارتك`, exact: true }).getByText('حارتك', { exact: true })).toBeVisible();
  await expect(page.getByRole('listitem', { name: zones[1].name, exact: true }).getByText(/لم يتم تحديد الساعة بعد/)).toBeVisible();
  await page.getByRole('button', { name: 'قراءة الإعلان', exact: true }).click();
  await expect(page).toHaveURL(/\/announcements\/100000000000000000000001$/);
  await expect(page.getByRole('heading', { name: 'إعلان اختبار العرض', exact: true })).toBeVisible();
  await expect(page.locator('.announcement-body')).toContainText('<script>');
  expect(await page.evaluate(() => window.unwantedScript)).toBeUndefined();
  await page.getByRole('navigation', { name: 'التنقل الرئيسي' }).getByRole('button', { name: 'الرئيسية', exact: true }).click();
  await expect(page.getByText('الضخ جارٍ', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/screenshots/citizen-home-populated-test-data.png', fullPage: true });
});

test('summary loading, error recovery, manual refresh, and revisit refresh work', async ({ page }) => {
  await citizen(page, '0594333333');
  let calls = 0;
  await page.route('**/api/home/summary', async (route) => {
    calls++;
    if (calls === 1) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({ status: 503, json: { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'الخدمة غير متاحة مؤقتًا.' } } });
    } else await route.continue();
  });
  await page.goto('/home');
  await expect(page.getByRole('status', { name: 'جارٍ تحميل مستجدات المجلس' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'تعذّر تحميل آخر المستجدات', exact: true })).toBeVisible();
  await expect(page.getByText('لا يوجد ضخ معلن حاليًا', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await expect(page.getByText('لا يوجد ضخ معلن حاليًا', { exact: true })).toBeVisible();
  const recovered = calls;
  await page.getByRole('button', { name: 'تحديث المعلومات', exact: true }).click();
  await expect.poll(() => calls).toBeGreaterThan(recovered);
  await expect(page.getByRole('button', { name: 'تحديث المعلومات', exact: true })).toBeEnabled();
  const refreshed = calls;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => calls).toBeGreaterThan(refreshed);
});

test('an expired server session clears the protected dashboard instead of showing private data', async ({ page }) => {
  await citizen(page, '0594444444');
  await page.goto('/home');
  await expect(page.getByText('لا يوجد ضخ معلن حاليًا', { exact: true })).toBeVisible();
  const me = (await (await page.request.get('/api/auth/me')).json()).data;
  await page.request.post('/api/auth/logout', { headers: { Origin: 'http://127.0.0.1:4173', 'X-CSRF-Token': me.csrfToken }, data: {} });
  await page.getByRole('button', { name: 'تحديث المعلومات', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
});
