# دور المي — installable PWA

Door El May remains the same React/Vite application, Express service, MongoDB database, account system, and Arabic RTL interface. The PWA adds installation metadata, icons, a static-only cache, offline guidance, and user-controlled updates. Installation alone enables no push notifications. Subsequent optional push infrastructure is documented in [WEB_PUSH.md](WEB_PUSH.md), with sending disabled by default; it reuses this worker without caching APIs. There is no background submission queue or second application.

Staging: <https://dor-el-may-talfit-staging.onrender.com>. Installation belongs to this origin; a future production domain is a separate installation.

## Install

Share **<https://dor-el-may-talfit-staging.onrender.com/download>**. The gateway uses the real village photograph, official council logo and existing water-drop mark. Its centered branding, pill-shaped CTA and the setup page's glass action panel follow the two October 26 design references; the generated backgrounds/logos in those references are not used as site assets.

**Android:** The gateway's user-clicked anchor retains the Chrome Intent format physically verified on the earlier browser test, with the destination changed to `/setup`. Recognized external Chrome uses a normal client-side link to `/setup`, preserving any captured install event. Known webview/app hints help distinguish embedded Chrome user agents; an app that hides its identity can require manual browser opening. No automatic browser launch or retry occurs. Copy Link always copies the fixed HTTPS setup URL; denied clipboard access reveals a selected URL for manual copying.

**iPhone/iPad:** Use the same sharing link, open the setup URL in Safari, then Page Menu → Share (or Share directly) → Add to Home Screen. Enable Open as Web App when offered, then Add. The page supplies manual instructions and no Android Intent or native-install promise on iOS.

`/setup` reuses the single existing `PwaProvider` listener for `beforeinstallprompt` and `appinstalled`. The real install button exists only when a deferred event is available. The event is consumed once, synchronously from the user's click. Acceptance/dismissal and browser confirmation are separate states; confirmation never marks the current browser tab standalone. Without an event, browser-menu instructions replace the button. The original optional install banner is suppressed on these two pages to avoid duplicates; update handling remains intact.

Ordinary browser visits to `/`, citizen login/registration/guest routes, and citizen feature routes lead to `/download`. Installed windows use supported display-mode/iOS standalone checks and retain the existing citizen UI, authentication, navigation and notifications. `/admin` and its secure login/dashboard remain available in ordinary browsers. Mode detection controls presentation only: it supplies no API access, role or session. Existing server authentication, authorization, CSRF, origins, cookies, API routes, health checks, static assets and asset links remain unchanged.

The manifest retains `دور المي – تلفيت`, root `id`, `scope`, and `start_url`, `display=standalone`, Arabic RTL and the existing icons. An installed launch at `/` reaches the original authentication/home flow; opening `/download` or `/setup` inside the installed app returns to that flow without a gateway loop. Existing sessions remain subject to the same rules. Where the OS isolates Home Screen storage from Safari/Chrome, sign in once inside the installed app.

The temporary browser-test assets and test are removed; `/browser-test` redirects to `/download`. The cancelled `/install` route remains absent. Dedicated Vite HTML entries for `/download` and `/setup` expose the requested title, description and official council preview image to crawlers before JavaScript runs. Express serves those files on the existing Web Service; no Render configuration, environment setting or additional service is introduced.

### Shorter public URLs

The safest short branded link is a council-owned HTTPS address or short path that redirects to the current `/download` URL. Configure a fixed redirect only after ownership and the desired address are agreed; this keeps the installation origin and existing installed apps on the current Render address. No short domain is claimed to exist or be available.

Render also supports adding a custom domain while keeping the `onrender.com` address, but installing the app from a new origin requires a separately planned identity/session/push migration. No domain, DNS, service name or application-origin setting is changed here. See [Render custom domains](https://render.com/docs/custom-domains). Browser guidance follows [Chrome Intents](https://developer.chrome.com/docs/android/intents), [PWA display-mode detection](https://web.dev/learn/pwa/detection) and [Apple's Safari instructions](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios).

### Verification of the two screens

`tests/installation.spec.js` covers browser routing, admin exemption, intent destination and blocked handoff, clipboard fallback, native-prompt outcomes, iOS guidance, standalone launch/session persistence and responsive screenshots. Existing citizen regressions now use the supported iOS standalone property in a test-only fixture; normal-browser gateway/admin tests use unmodified browser contexts. This is a simulation of installed execution, not physical OS installation.

Screenshots: ignored `artifacts/screenshots/download-390.png` and `setup-390.png`, plus small/mobile/desktop variants. Run `npm run build`, `npm test`, `node --test --test-concurrency=1 server/test/production/*.test.js`, and `node scripts/run-browser-tests.mjs`. Tests use disposable local fixtures, not Atlas. Still verify the updated `/setup` handoff on the actual Messenger/Android phone, Chrome's real install dialog, home-screen launch, iPhone/iPad Safari and existing notification opt-in/delivery on physical devices.

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
