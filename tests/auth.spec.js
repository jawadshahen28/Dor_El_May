import { test, expect, emulateInstalledPwa } from './fixtures/installed-pwa.js';
import { mkdir } from 'node:fs/promises';

test('Arabic forms, actual images, responsive layouts, and guest navigation', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mkdir('artifacts/screenshots', { recursive: true });
  await page.goto('/home');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  for (const size of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'tablet', width: 768, height: 1024 }, { name: 'mobile', width: 390, height: 844 }, { name: 'small-mobile', width: 320, height: 740 }]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect.poll(() => page.evaluate(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
    await page.screenshot({ path: `artifacts/screenshots/login-${size.name}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page.getByText('يرجى إدخال رقم الهاتف', { exact: true })).toBeVisible();
  await page.getByLabel('رقم الهاتف', { exact: true }).fill('0599123456');
  await page.getByLabel('كلمة المرور', { exact: true }).fill('Pass9test');
  await page.getByRole('button', { name: 'إظهار كلمة المرور', exact: true }).click();
  await expect(page.getByLabel('كلمة المرور', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'إخفاء كلمة المرور', exact: true }).click();
  await expect(page.getByLabel('كلمة المرور', { exact: true })).toHaveAttribute('type', 'password');
  await page.getByRole('link', { name: 'إنشاء حساب جديد', exact: true }).click();
  await expect(page.getByLabel('اختر حارتك')).toBeEnabled();
  await expect(page.getByLabel('اختر حارتك').locator('option')).toHaveCount(6);
  for (const size of [{ name: 'mobile', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 1000 }]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/screenshots/register-${size.name}.png`, fullPage: true });
  }
  await page.getByRole('link', { name: 'تسجيل الدخول', exact: true }).click();
  await page.getByRole('link', { name: 'تصفح كزائر', exact: true }).click();
  await expect(page).toHaveURL(/\/guest$/);
  await expect(page.getByText('لا تتوفر معلومات عن الضخ الحالي', { exact: true })).toBeVisible();
  await expect(page.getByText('لم يتم الإعلان عن دور الغد بعد', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/screenshots/guest-desktop.png', fullPage: true });
  await expect(errors).toEqual([]);
});

test('real registration, refresh, restored browser session, logout, and new-device login', async ({ page, browser, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/register');
  await page.getByLabel('الاسم الكامل', { exact: true }).fill('مستخدم تجربة');
  await page.getByLabel('رقم الهاتف', { exact: true }).fill('0598123456');
  await page.getByLabel('اختر حارتك').selectOption({ label: 'الحارة الوسطى' });
  await page.getByLabel('كلمة المرور', { exact: true }).fill('BrowserTest9!');
  await page.getByLabel('تأكيد كلمة المرور', { exact: true }).fill('Mismatch9!');
  await page.getByRole('button', { name: 'إنشاء الحساب والدخول', exact: true }).click();
  await expect(page.getByText('كلمتا المرور غير متطابقتين', { exact: true })).toBeVisible();
  await page.getByLabel('تأكيد كلمة المرور', { exact: true }).fill('BrowserTest9!');
  await page.getByRole('button', { name: 'إنشاء الحساب والدخول', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { name: 'أهلًا بك، مستخدم تجربة' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'ترحيب ومعلومات الحارة' }).getByText('الحارة الوسطى', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'وين المياه شغالة حاليًا؟', exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/screenshots/home-mobile.png', fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'أهلًا بك، مستخدم تجربة' })).toBeVisible();
  const storage = await context.storageState();
  expect(storage.origins.every((origin) => origin.localStorage.length === 0)).toBe(true);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  const restored = await browser.newContext({ storageState: storage });
  await emulateInstalledPwa(restored);
  const restoredPage = await restored.newPage();
  await restoredPage.goto('/login');
  await expect(restoredPage).toHaveURL(/\/home$/);
  await restoredPage.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(restoredPage).toHaveURL(/\/login$/);
  await restored.close();
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('رقم الهاتف', { exact: true }).fill('0598123456');
  await page.getByLabel('كلمة المرور', { exact: true }).fill('WrongPass9');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page.getByText('رقم الهاتف أو كلمة المرور غير صحيحين', { exact: true })).toBeVisible();
  await page.getByLabel('كلمة المرور', { exact: true }).fill('BrowserTest9!');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole('button', { name: 'حسابي', exact: true }).click();
  await page.getByRole('button', { name: 'تسجيل الخروج من الحساب', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
