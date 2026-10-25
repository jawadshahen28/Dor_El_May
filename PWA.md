# دور المي — installable PWA

Door El May remains the same React/Vite application, Express service, MongoDB database, account system, and Arabic RTL interface. The PWA adds installation metadata, icons, a static-only service worker, offline guidance, and user-controlled updates. It adds no push notifications, background submission queue, production secrets, or second application.

Staging: <https://dor-el-may-talfit-staging.onrender.com>. Installation belongs to this origin; a future production domain is a separate installation.

## Install

**Android:** Open the HTTPS site in Chrome. When the browser offers installation, select **تثبيت التطبيق** in the app's small installation card, or use Chrome's menu → Install app / Add to Home screen. Confirm the browser's installation dialog.

**iPhone/iPad:** Open the site in Safari. Select Share → Add to Home Screen → Add. If an Open as Web App option appears, leave it enabled. The app's **خطوات التثبيت** card explains these manual steps; it does not imitate a native iOS install prompt.

Eligible browsers use the real `beforeinstallprompt` event. Dismissing the card or native prompt suppresses the suggestion for 30 days using a timestamp preference only. No account information or token is placed in localStorage. The card is hidden in standalone mode and on admin routes. Unsupported mobile browsers receive manual instructions after a short delay. Installation UI is offered by browser capability, not as a guarantee for every browser or OS version.

The manifest uses `دور المي – تلفيت`, short name `دور المي`, Council branding in its description, `lang=ar`, `dir=rtl`, `display=standalone`, and a stable root `id`, `scope`, and `start_url`. Opening `/` invokes the existing authentication flow. Valid cookie sessions continue under the existing session rules; if an OS isolates the installed app's cookie storage from Safari/Chrome, sign in once in that installed context.

## Icons and safe areas

The 192px and 512px icons, 512px maskable icon, and 180px Apple touch icon are deterministic rasterizations of the existing `client/public/images/water-mark.svg`. No alternative Council logo was introduced. The maskable asset has an opaque background and keeps the artwork inside its central safe zone.

Regenerate locally with `npm run icons:pwa` when necessary. That explicit development command uses local Chrome through Playwright; Render builds use the committed PNG files and do not launch a browser. Existing Council/village photos are preserved.

Installed-mode styles add notch/safe-area spacing while preserving RTL, the existing layouts, and fixed bottom navigation. Existing browser-mode page styles remain intact.

## Privacy and offline behavior

`vite-plugin-pwa` 2 builds a custom classic service worker using `injectManifest`. The plugin is compatible with the project's Vite 7 / Node 24 versions. The repaired cross-platform native lockfile remains complete; existing dependency versions were preserved when adding the plugin.

The worker precaches **only an explicit allowlist of public static files**: hashed JavaScript, CSS and fonts; the approved logos/village artwork; PWA icons; and a separate generic `offline.html`. It never caches `index.html`, authenticated navigation HTML, arbitrary images, query-bearing URLs, or any `/api` response. Static cache population omits cookies, and no runtime response is written to a cache.

All `/api` methods, including POST, use network-only `cache: no-store` behavior. This includes authentication, CSRF/session responses, account information, citizen reports, admin APIs, schedules, announcements, zones, and health. The existing server `Cache-Control: no-store` remains in force; client API requests also explicitly use `cache: no-store`. Offline API requests return a safe 503 JSON error and are never queued for later submission. API requests never receive offline HTML.

Navigation always attempts the network without caching the response. On failure, the worker returns the generic Arabic offline document:

An initial successful online visit is required to install the worker and cache these public assets; a first-ever visit without connectivity cannot supply the application's fallback.

> لا يوجد اتصال بالإنترنت
>
> يرجى الاتصال بالإنترنت للحصول على أحدث معلومات ضخ المياه.

For an already-open app, an offline event or actual worker API-network failure hides the application content and disables its interaction. This prevents old pumping summaries or personal data from appearing current. Existing state is only in memory; it is not written to persistent PWA storage. Reconnection alone does not reveal the old view: **إعادة المحاولة** explicitly reloads and rechecks the session and database-backed data. Reloading discards any unsent form content, as a normal browser refresh would.

Logout, role checks, CSRF, Origin validation, secure cookie settings, and session persistence remain implemented by the existing backend. The PWA is not an offline account or administrator interface.

## Safe updates

The worker waits when a replacement version is installed. The app checks on opening and when revisited after at least a minute, alongside normal browser checks. It shows:

> يتوفر تحديث جديد لتطبيق دور المي
>
> تحديث الآن

Only that explicit action promotes the waiting worker and reloads the accepting tab. If the tab contains a form that has been edited, a confirmation allows the user to cancel without losing the draft. Edited forms are tracked weakly so detached login/password forms are not retained by the update mechanism. Other open tabs are not automatically reloaded.

Caches are identified by a digest of the generated asset revisions. The worker retains at most three static versions, allowing recently opened older tabs to finish using their hashed assets while preventing unbounded accumulation. Fresh pages use current assets. Long-lived tabs spanning many deployments should eventually be reopened after their work is saved.

## Express / Render

Render remains one Web Service with the same commands:

```text
npm ci --include=dev && npm run build
npm start
```

The build emits `manifest.webmanifest`, `sw.js`, `offline.html`, icons, and hashed assets inside `client/dist`. Express serves them ahead of the SPA fallback. `sw.js`, the manifest, and HTML have revalidation headers; the worker is explicitly allowed scope `/`. CSP explicitly permits only same-origin workers and manifests. API routes, the readiness endpoint, origin settings, database credentials, and deployment environment names remain unchanged. HTTPS is supplied by the existing Render URL; local Chrome also permits service-worker testing on loopback.

Development Vite does not register the worker, avoiding development cache interference. Use the production build and test server to test worker behavior. Private/incognito Chrome profiles prohibit installation even when the manifest is valid; use a regular browser profile for an installation-eligibility check.

## Verification

Run `npm test`, `npm run test:db`, `npm run test:production`, and `npm run test:ui`. Database tests use disposable local MongoDB processes; no test accounts are added to Atlas. Unit tests verify manifest identity, real PNG dimensions, and the cache allowlist. Production tests verify manifest/worker/icon/offline delivery, headers, API separation, and existing secure sessions.

The dedicated `tests/pwa.spec.js` uses the actual production worker. It covers Chrome manifest/installability diagnostics in a fresh isolated regular profile; static-only CacheStorage; citizen logout/account switching; offline citizen/admin views; cold navigation fallback and retry; install-event handling and dismissal; standalone detection; iPhone instructions; and a real waiting worker/update lifecycle with a second tab's draft preserved. The install-event UI test supplies an explicit simulated browser event; it does not claim an OS-level installation. iPhone guidance is tested with a Chrome user-agent/mobile emulation, not physical Safari.

Existing display-fixture regression tests block service workers so their `page.route` mocks retain their original meaning. PWA tests explicitly enable real workers. Screenshots are stored only in ignored `artifacts/screenshots/pwa-*.png` and use disposable fixtures.

Physical Android/iPhone installation, OS-specific launch/splash/safe-area behavior, installed-app cookie sharing, and multi-device update behavior still need manual checks. Build and live deployment results are recorded in `VERIFICATION.md` and in the delivery report. No physical-device testing is claimed.

## Files

Created: `client/pwa.config.js`, `client/offline.html`, `client/public/icons/pwa-192.png`, `client/public/icons/pwa-512.png`, `client/public/icons/pwa-maskable-512.png`, `client/public/icons/apple-touch-icon.png`, `client/src/sw.js`, `client/src/pwa/cachePolicy.js`, `client/src/pwa/PwaProvider.jsx`, `client/src/pwa/PwaExperience.jsx`, `client/src/pwa/pwa.css`, `client/src/pwa/offline.css`, `client/src/pwa/offline.js`, `scripts/generate-pwa-icons.mjs`, `server/test/pwa.test.js`, `tests/pwa.spec.js`, `PWA.md`.

Modified: `client/package.json`, `package.json`, `package-lock.json`, `client/vite.config.js`, `client/index.html`, `client/src/main.jsx`, `client/src/services/api.js`, `server/src/app.js`, `playwright.config.js`, `scripts/browser-test-server.mjs`, `server/test/production/deployment.test.js`, `README.md`, `RENDER_DEPLOY.md`, `VERIFICATION.md`.
