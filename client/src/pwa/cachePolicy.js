export const STATIC_CACHE_PREFIX = 'door-el-may-static-v1-';
export const MAX_STATIC_VERSIONS = 3;

const publicFiles = new Set([
  '/offline.html', '/icons/pwa-192.png', '/icons/pwa-512.png',
  '/icons/pwa-maskable-512.png', '/icons/apple-touch-icon.png',
  '/images/water-mark.svg', '/images/village-landscape.svg',
  '/images/talfit-village.jpg', '/images/talfit-council-logo.jpg',
]);
export const isApiPath = (path) => path === '/api' || path.startsWith('/api/');
export const isVersionedAsset = (path) => /^\/assets\/[^/]+-[\w-]{8,}\.(?:js|css|woff2?)$/.test(path);

export function isPublicStaticUrl(url, origin) {
  return url.origin === origin && !url.search && !isApiPath(url.pathname)
    && (publicFiles.has(url.pathname) || isVersionedAsset(url.pathname));
}
