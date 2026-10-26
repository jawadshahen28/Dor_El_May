import express from 'express';
import helmet from 'helmet';
import session from 'express-session';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extname } from 'node:path';
import { authRoutes } from './routes/authRoutes.js';
import { zoneRoutes } from './routes/zoneRoutes.js';
import { homeRoutes } from './routes/homeRoutes.js';
import { waterRoundRoutes } from './routes/waterRoundRoutes.js';
import { announcementRoutes } from './routes/announcementRoutes.js';
import { reportRoutes } from './routes/reportRoutes.js';
import { adminRoutes } from './routes/adminRoutes.js';
import { notificationRoutes } from './routes/notificationRoutes.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler } from './middleware/errorHandler.js';
import { failure, success } from './utils/response.js';

export function createApp({ config, store, limits, isDatabaseAvailable, checkDatabaseHealth }) {
  const app = express();
  app.locals.pushSessionSecret = config.sessionSecret;
  app.disable('x-powered-by');
  if (config.trustProxyHops) app.set('trust proxy', config.trustProxyHops);
  app.use(helmet({
    strictTransportSecurity: config.production ? undefined : false,
    contentSecurityPolicy: { directives: {
      'default-src': ["'self'"], 'script-src': ["'self'"], 'style-src': ["'self'"],
      'img-src': ["'self'", 'data:'], 'font-src': ["'self'"], 'connect-src': ["'self'"],
      'worker-src': ["'self'"], 'manifest-src': ["'self'"],
      'upgrade-insecure-requests': config.production ? [] : null,
    } },
  }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/api/health', async (_req, res) => {
    let ready = isDatabaseAvailable() && Boolean(store && limits);
    try { if (ready && checkDatabaseHealth) ready = await checkDatabaseHealth(); }
    catch { ready = false; }
    if (config.production && !ready) return failure(res, 503, 'SERVICE_UNAVAILABLE', 'الخدمة غير متاحة مؤقتًا.');
    return success(res, { status: ready ? 'ok' : 'degraded', database: isDatabaseAvailable() ? 'connected' : 'unavailable' });
  });
  app.use('/api', (_req, res, next) => isDatabaseAvailable() && store && limits
    ? next() : failure(res, 503, 'SERVICE_UNAVAILABLE', 'تعذّر الاتصال بالخدمة. يرجى المحاولة لاحقًا، أو التصفح كزائر.'));
  if (store && limits) {
    app.use('/api', limits.general);
    app.use('/api', session({
      name: config.cookieName, secret: config.sessionSecret, store,
      resave: false, saveUninitialized: false, rolling: true,
      cookie: { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/', maxAge: config.sessionDays * 86400000 },
    }));
    app.use('/api', csrfProtection(config.origins));
    app.use('/api', express.json({ limit: '12kb', strict: true }));
    app.use('/api/auth', authRoutes(config, limits));
    app.use('/api/admin', adminRoutes(config, limits));
    app.use('/api/zones', zoneRoutes);
    app.use('/api/home', homeRoutes);
    app.use('/api/water-rounds', waterRoundRoutes);
    app.use('/api/announcements', announcementRoutes);
    app.use('/api/reports', reportRoutes(limits));
    app.use('/api/notifications', notificationRoutes(config, limits));
  }
  app.use('/api', (_req, res) => failure(res, 404, 'NOT_FOUND', 'الصفحة المطلوبة غير موجودة.'));
  const clientDirectory = fileURLToPath(new URL('../../client/dist/', import.meta.url));
  if (existsSync(clientDirectory)) {
    // Temporary, standalone browser-opening experiment; independent of the SPA.
    app.get('/browser-test', (_req, res) => res.set('Cache-Control', 'no-store').sendFile(`${clientDirectory}/browser-test/index.html`));
    // Only this public Android association file may bypass dotfile filtering.
    app.get('/.well-known/assetlinks.json', (_req, res) => res.sendFile(`${clientDirectory}/.well-known/assetlinks.json`, { dotfiles: 'allow' }));
    app.use(express.static(clientDirectory, { setHeaders(res, path) {
      if (['index.html', 'offline.html', 'sw.js', 'manifest.webmanifest'].some((name) => path.endsWith(`/${name}`) || path.endsWith(`\\${name}`))) res.set('Cache-Control', 'no-cache');
      if (path.endsWith('/sw.js') || path.endsWith('\\sw.js')) res.set('Service-Worker-Allowed', '/');
    } }));
    app.get('/{*path}', (req, res, next) => {
      // Missing assets, dotfiles and JSON requests must never receive SPA HTML.
      if (!req.accepts('html') || extname(req.path) || req.path.split('/').some((part) => part.startsWith('.'))) return next();
      res.set('Cache-Control', 'no-cache');
      return res.sendFile(`${clientDirectory}/index.html`);
    });
  }
  app.use((_req, res) => failure(res, 404, 'NOT_FOUND', 'الصفحة المطلوبة غير موجودة.'));
  app.use(errorHandler);
  return app;
}
