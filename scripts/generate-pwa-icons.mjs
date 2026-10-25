import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Rasterize the existing vector artwork without changing its paths or branding.
const svg = await readFile(new URL('../client/public/images/water-mark.svg', import.meta.url), 'utf8');
const directory = new URL('../client/public/icons/', import.meta.url);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
try {
  for (const [name, size, scale, background] of [
    ['pwa-192.png', 192, 0.8, '#ffffff'], ['pwa-512.png', 512, 0.8, '#ffffff'],
    ['pwa-maskable-512.png', 512, 0.6, '#edf6ff'], ['apple-touch-icon.png', 180, 0.8, '#ffffff'],
  ]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const height = size * scale, width = height * 120 / 148;
    await page.setContent(`<html><body style="margin:0;width:100vw;height:100vh;background:${background};display:grid;place-items:center">${svg.replace('<svg ', `<svg width="${width}" height="${height}" `)}</body></html>`);
    await page.screenshot({ path: fileURLToPath(new URL(name, directory)), type: 'png' });
    await page.close();
    console.log(`Created ${name} (${size}x${size}).`);
  }
} finally { await browser.close(); }
