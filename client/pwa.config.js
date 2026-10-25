export const pwaManifest = {
  id: '/', name: 'دور المي – تلفيت', short_name: 'دور المي',
  description: 'نظام توزيع المياه في قرية تلفيت – مجلس قروي تلفيت',
  lang: 'ar', dir: 'rtl', start_url: '/', scope: '/', display: 'standalone',
  theme_color: '#0079e9', background_color: '#f4f8fc',
  icons: [
    { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
