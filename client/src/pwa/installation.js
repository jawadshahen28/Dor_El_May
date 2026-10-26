// Public sharing and external-browser actions always use this trusted URL.
export const INSTALL_URL = 'https://dor-el-may-talfit-staging.onrender.com/install';
export const ANDROID_CHROME_INTENT = 'intent://dor-el-may-talfit-staging.onrender.com/install#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(INSTALL_URL) + ';end';

// Hints only: the captured browser event decides whether a prompt is available.
export function installationHints({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  const ios = /iPad|iPhone|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
  return {
    ios,
    android: !ios && /Android/i.test(userAgent),
    embedded: /FBAN|FBAV|Instagram|Messenger|WhatsApp|Telegram|\bwv\b|Line\/|Snapchat|TikTok|MicroMessenger/i.test(userAgent),
  };
}

export async function copyInstallationLink() {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(INSTALL_URL);
      return true;
    }
  } catch { /* Some embedded browsers deny clipboard access. Try the selection API. */ }
  const previousFocus = document.activeElement;
  const buffer = document.createElement('textarea');
  buffer.value = INSTALL_URL;
  buffer.readOnly = true;
  buffer.className = 'install-copy-buffer';
  buffer.setAttribute('aria-label', 'رابط تثبيت التطبيق');
  document.body.appendChild(buffer);
  try {
    buffer.select();
    buffer.setSelectionRange(0, INSTALL_URL.length);
    return document.execCommand?.('copy') === true;
  } catch { return false; }
  finally { buffer.remove(); previousFocus?.focus({ preventScroll: true }); }
}
