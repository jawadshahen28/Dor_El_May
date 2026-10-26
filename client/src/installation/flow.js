export const DOWNLOAD_URL = 'https://dor-el-may-talfit-staging.onrender.com/download';
export const SETUP_URL = 'https://dor-el-may-talfit-staging.onrender.com/setup';
// Same click-only anchor syntax proven on /browser-test; only the destination changes.
export const CHROME_SETUP_INTENT = 'intent://dor-el-may-talfit-staging.onrender.com/setup#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(SETUP_URL) + ';end';

export function browserHints({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  const ios = /iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
  const android = !ios && /Android/i.test(userAgent);
  const embedded = /FBAN|FBAV|FB_IAB|Instagram|Messenger|WhatsApp|Telegram|\bwv\b|Line\/|Snapchat|TikTok|MicroMessenger/i.test(userAgent);
  const chrome = /Chrome\/\d/i.test(userAgent) && !/EdgA|OPR|SamsungBrowser|Version\/4\.0/i.test(userAgent) && !embedded;
  return { ios, android, embedded, chrome };
}

export const normalizedPath = pathname => pathname.toLowerCase().replace(/\/+$/, '') || '/';
export const isInstallationRoute = pathname => ['/download', '/setup'].includes(normalizedPath(pathname));

// A display preference only. API authorization remains entirely server-side.
export function isCitizenRoute(pathname) {
  const path = normalizedPath(pathname);
  return path === '/' || /^\/(login|register|guest|home|schedule|announcements|reports|account|notifications)(\/|$)/.test(path);
}
