import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pwaManifest } from '../../client/pwa.config.js';
import { isApiPath, isPublicStaticUrl, isVersionedAsset, MAX_STATIC_VERSIONS } from '../../client/src/pwa/cachePolicy.js';

test('PWA identity starts the existing root authentication flow in standalone Arabic RTL', () => {
  assert.equal(pwaManifest.name, 'دور المي – تلفيت');
  assert.equal(pwaManifest.short_name, 'دور المي');
  assert.match(pwaManifest.description, /مجلس قروي تلفيت/);
  assert.equal(pwaManifest.id, '/');
  assert.equal(pwaManifest.start_url, '/');
  assert.equal(pwaManifest.scope, '/');
  assert.equal(pwaManifest.display, 'standalone');
  assert.equal(pwaManifest.lang, 'ar');
  assert.equal(pwaManifest.dir, 'rtl');
});

test('app, maskable and Apple touch icons are actual PNG files at their declared dimensions', () => {
  for (const icon of [...pwaManifest.icons, { src: '/icons/apple-touch-icon.png', sizes: '180x180' }]) {
    const png = readFileSync(new URL(`../../client/public${icon.src}`, import.meta.url));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), Number(icon.sizes.split('x')[0]));
    assert.equal(png.readUInt32BE(20), Number(icon.sizes.split('x')[1]));
  }
  assert.ok(pwaManifest.icons.some((icon) => icon.purpose === 'maskable' && icon.sizes === '512x512'));
});

test('cache allowlist rejects all authenticated data, navigations, foreign origins and query-bearing URLs', () => {
  const origin = 'https://staging.example';
  for (const path of ['/api', '/api/auth/me', '/api/auth/login', '/api/auth/logout', '/api/reports/mine', '/api/admin/dashboard', '/api/zones', '/api/water-rounds', '/api/announcements', '/home', '/account', '/admin', '/', '/index.html', '/manifest.webmanifest', '/sw.js', '/images/citizen-upload.jpg', '/assets/profile.json']) {
    assert.equal(isPublicStaticUrl(new URL(path, origin), origin), false, path);
  }
  assert.equal(isPublicStaticUrl(new URL('/icons/pwa-192.png?token=private', origin), origin), false);
  assert.equal(isPublicStaticUrl(new URL('https://another.example/icons/pwa-192.png'), origin), false);
  for (const path of ['/offline.html', '/icons/pwa-192.png', '/images/water-mark.svg', '/assets/index-1234abcd.js', '/assets/styles-1234abcd.css', '/assets/tajawal-arabic-400-normal-CyCXRvzh.woff2']) {
    assert.equal(isPublicStaticUrl(new URL(path, origin), origin), true, path);
  }
  assert.equal(isApiPath('/api/admin/login'), true);
  assert.equal(isApiPath('/apiary'), false);
  assert.equal(isVersionedAsset('/assets/unversioned.js'), false);
  assert.equal(MAX_STATIC_VERSIONS, 3);
});
