import test from 'node:test';
import assert from 'node:assert/strict';
import { browserHints, CHROME_SETUP_INTENT, DOWNLOAD_URL, SETUP_URL, isCitizenRoute, isInstallationRoute } from '../../client/src/installation/flow.js';

test('handoff preserves the proven Chrome anchor format with a fixed HTTPS setup destination', () => {
  assert.equal(DOWNLOAD_URL, 'https://dor-el-may-talfit-staging.onrender.com/download');
  assert.equal(SETUP_URL, 'https://dor-el-may-talfit-staging.onrender.com/setup');
  assert.equal(CHROME_SETUP_INTENT, 'intent://dor-el-may-talfit-staging.onrender.com/setup#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(SETUP_URL) + ';end');
});

test('browser routing classifies citizen presentation separately from admin, APIs and technical assets', () => {
  for (const path of ['/', '/login', '/register', '/guest', '/home', '/schedule/', '/announcements/abc', '/reports/mine', '/account', '/notifications', '/HOME/']) assert.equal(isCitizenRoute(path), true, path);
  for (const path of ['/admin', '/admin/login', '/admin/water', '/download', '/setup', '/install', '/api/auth/me', '/api/health', '/sw.js', '/manifest.webmanifest', '/.well-known/assetlinks.json', '/assets/app.js']) assert.equal(isCitizenRoute(path), false, path);
  for (const path of ['/download', '/setup', '/Setup/']) assert.equal(isInstallationRoute(path), true);
  assert.equal(isInstallationRoute('/install'), false);
});

test('browser hints distinguish external Chrome, known Android webviews and desktop-mode iPad', () => {
  assert.deepEqual(browserHints({ userAgent: 'Android Chrome/130 Mobile Safari' }), { ios: false, android: true, embedded: false, chrome: true });
  for (const hint of ['FBAV/500', 'Messenger', 'wv', 'Instagram']) {
    const result = browserHints({ userAgent: 'Android Chrome/130 ' + hint });
    assert.equal(result.embedded, true); assert.equal(result.chrome, false);
  }
  assert.equal(browserHints({ platform: 'MacIntel', maxTouchPoints: 5 }).ios, true);
  assert.equal(browserHints({ userAgent: 'iPhone' }).android, false);
});
