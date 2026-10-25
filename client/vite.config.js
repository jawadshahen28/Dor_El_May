import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaManifest } from './pwa.config.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss(), VitePWA({
      strategies: 'injectManifest', srcDir: 'src', filename: 'sw.js',
      injectRegister: false, registerType: 'prompt', scope: '/',
      manifest: pwaManifest, manifestFilename: 'manifest.webmanifest',
      includeAssets: [],
      injectManifest: {
        rollupFormat: 'iife',
        globPatterns: ['assets/**/*.{js,css,woff,woff2}', 'icons/*.png', 'images/*.{svg,jpg}', 'offline.html'],
        // Navigation HTML and every API are deliberately excluded from the cache.
        globIgnores: ['**/index.html', '**/*.map'], maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    })],
    build: { rollupOptions: { input: {
      app: fileURLToPath(new URL('./index.html', import.meta.url)),
      offline: fileURLToPath(new URL('./offline.html', import.meta.url)),
    } } },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: env.API_PROXY_TARGET || 'http://127.0.0.1:3001',
          // Preserve the browser's Origin, Host, cookies, and CSRF header.
          // Express checks the exact browser origin against APP_ORIGINS.
          changeOrigin: false,
        },
      },
    },
  };
});
