// Temporary experiment: remove this folder, its Express route and its browser test together.
(() => {
  'use strict';
  const websiteUrl = 'https://dor-el-may-talfit-staging.onrender.com/';
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = !ios && /Android/i.test(navigator.userAgent);
  const chromeLink = document.getElementById('chrome-link');
  const urlInput = document.getElementById('website-url');
  const copyButton = document.getElementById('copy-link');
  const copyStatus = document.getElementById('copy-status');

  if (android) {
    chromeLink.href = 'intent://dor-el-may-talfit-staging.onrender.com/#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(websiteUrl) + ';end';
    chromeLink.hidden = false;
  }
  document.getElementById('safari-help').hidden = !ios;
  document.getElementById('other-device-help').hidden = ios || android;

  urlInput.addEventListener('focus', () => urlInput.select());
  copyButton.addEventListener('click', async () => {
    copyButton.disabled = true;
    try {
      await navigator.clipboard.writeText(websiteUrl);
      copyStatus.textContent = 'تم نسخ الرابط.';
    } catch {
      urlInput.focus();
      urlInput.select();
      copyStatus.textContent = 'تعذّر النسخ التلقائي. الرابط محدد؛ اضغط عليه مطولًا أو استخدم أمر النسخ في جهازك.';
    } finally { copyButton.disabled = false; }
  });
})();
