# Door El May – Talfit: GitHub and Render staging preparation

Originally prepared on 25 October 2026. The project has since been uploaded to GitHub and deployed to staging at <https://dor-el-may-talfit-staging.onrender.com>. This remains the configuration guide; verified PWA build/deployment results are recorded separately in `VERIFICATION.md` and the delivery report. PWA installation, offline privacy, and updates are documented in [PWA.md](PWA.md). No existing Atlas records or local secrets are changed by PWA integration.

## Service settings

Optional Web Push infrastructure is documented in [WEB_PUSH.md](WEB_PUSH.md). Keep `PUSH_OUTBOUND_ENABLED=false`; configuring/deploying the website does not run the sender. New push variable names are `PUSH_OUTBOUND_ENABLED`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_SUBSCRIPTION_KEY`, `PUSH_STAGING_CONFIRMED`, `PUSH_STAGING_DATABASE`, `PUSH_TEST_USER_IDS`, `PUSH_DELIVERY_NOT_BEFORE`. They are not required for ordinary login/admin/PWA operation while push is unconfigured. Before an explicitly authorized real device test, verify isolated staging credentials/accounts and follow that guide. A separately provisioned Render Cron Job can run `npm run push:process` every minute; no cron, service, real keys or sending activation is created automatically.

Use **one Render Web Service with the native Node runtime**. Express serves both `client/dist` and `/api` on one HTTPS origin; no second frontend service, CORS exception, or Vite production server is needed. [Render Express deployment guide](https://render.com/docs/deploy-node-express-app).

| Setting | Exact selection |
| --- | --- |
| Service type | Web Service |
| Language/runtime | Node |
| Root Directory | Leave blank: repository root containing `package.json`, `package-lock.json`, `client`, `server`, and `shared` |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Pre-deploy Command | Leave blank |
| Persistent disk | None required; application data and sessions are stored in MongoDB |

`npm start` uses the existing server workspace command `node src/index.js`. It starts one Express process, without a watcher. Production defaults to `0.0.0.0` and honors Render's supplied `PORT`. [Render port-binding requirements](https://render.com/docs/web-services#port-binding).

Development dependencies must be installed for Vite/Tailwind. Do not substitute `npm ci --omit=dev` before the build. The root package config disables the test MongoDB package's installation-time binary download; explicit database/browser tests can still obtain their binary when needed. Do not use `--ignore-scripts`, because native dependencies such as Argon2 may require installation scripts.

`.node-version` selects Node 24; the package engine range also has an upper bound to avoid accidentally selecting a future major. Render resolves the major to an available patch release. Local verification used Node 24.12.0; the Linux native runtime still needs its first staging verification. [Render Node version selection](https://render.com/docs/node-version).

## Environment settings

These names come from `server/src/config/env.js`; none are new authentication or database configuration names. Set them in Render's Environment settings, without committing an `.env` file.

| Name | Staging setting |
| --- | --- |
| `NODE_ENV` | `production` — staging uses full production security |
| `MONGODB_URI` | Secret connection string for a separate staging database and staging-only database user |
| `SESSION_SECRET` | Secret random value, at least 32 characters; unique to staging and stable across restarts/deploys |
| `APP_ORIGINS` | The exact public HTTPS origin shown for this service; no path, trailing slash, wildcard, or local development origins |
| `TRUST_PROXY_HOPS` | `1` for the intended direct Render HTTPS-proxy topology; verify forwarding behavior before accepting the staging deployment |
| `HOST` | `0.0.0.0` (also the production default) |
| `PORT` | Supplied by Render; normally leave it platform-managed |
| `SESSION_DAYS` | Optional; defaults to `30`, valid range 1–90 |

`NODE_ENV`, `MONGODB_URI`, `SESSION_SECRET`, and `APP_ORIGINS` are required production settings. `TRUST_PROXY_HOPS` is required for the intended proxied setup; its code default is zero. `HOST` and `SESSION_DAYS` can use their defaults. Keep the same `SESSION_SECRET` and database between service restarts to preserve sessions. Deliberately rotating that secret invalidates existing sessions.

`API_PROXY_TARGET` is read only by the Vite development proxy. Do not configure a separate frontend API URL or expose secrets with a `VITE_` prefix. The production frontend uses same-origin relative `/api` requests.

The root and server `.env.example` files list names with empty values; the client template lists only the development proxy name. The server loads `server/.env` locally; the root example is a reference, not an automatically loaded server configuration file. `npm run setup:env` still creates local development defaults and a random secret only when `server/.env` does not exist. Do not run it on Render.

Set `APP_ORIGINS` from the actual service address before enabling public testing. If moving to a custom domain, add that exact HTTPS origin before testing it. A comma-separated list is supported if both service and custom-domain origins should remain usable; cookies are host-scoped and sign-in does not carry between distinct hostnames.

The proxy trust value must match the actual deployment path. Adding a CDN or another proxy requires reviewing that value and the forwarded client-IP/HTTPS headers; do not blindly trust all proxies or weaken CSRF to resolve a configuration error. [Express proxy guidance](https://expressjs.com/en/guide/behind-proxies/).

## Keep the first deployment separate from real citizens

1. Create a dedicated staging Atlas project/cluster where practical, or at minimum a separate staging database. Use separate database credentials restricted to `readWrite` on that staging database, with no access to the real application database. Normal startup initializes existing-model collections/indexes, including unique and TTL indexes.
2. Put only that staging connection string in this service. Keep the existing local/real `MONGODB_URI` and `SESSION_SECRET` unchanged. Do not copy citizens, reports, sessions, announcements, or water rounds from the real database. Do not restore a production dump into staging.
3. Add the service's outbound IP ranges to the staging Atlas project's Network Access list. Retrieve them from the service's **Connect → Outbound** panel; do not hardcode an IP from this guide. Allow all relevant ranges for that service/region. Avoid a permanent `0.0.0.0/0` rule. Atlas network rules apply at the project level, another reason to keep staging separate. [Render outbound addresses](https://render.com/docs/outbound-ip-addresses), [Atlas access-list documentation](https://www.mongodb.com/docs/atlas/security/ip-access-list/).
4. Preserve TLS certificate validation. Use the official Atlas connection string with the exact staging database name and correctly encoded username/password components. The service needs working SRV/DNS resolution and outbound connectivity to Atlas.
5. Start with an empty staging application database. It is expected to display real zero counters and empty lists. To test citizen registration, explicitly add a staging-only zone through your authorized Atlas workflow using the existing Zone schema (`name`, `isActive`); no deployment seed creates one. Use controlled test accounts and test data only.
6. Create a staging administrator only through the existing interactive `npm run admin:create` command, from a trusted local terminal configured securely for the staging database. Prefer a separate local checkout and an ignored `server/.env` for staging so the current real configuration stays untouched. Do not put the database URI or an admin password in shell arguments/history. Authorize that workstation's IP temporarily in staging Atlas if necessary. The command hides password input, reports the configuration source, and requires typing `CREATE` before writing. See [ADMIN_SYSTEM.md](ADMIN_SYSTEM.md).

Do not run `npm run seed`, `npm run admin:create`, test servers, test fixtures, or database-copy scripts as build, pre-deploy, startup, or scheduled deployment commands. The provided build/start commands contain none of them.

A staging URL is public and may be discovered. A separate database prevents this test service from having access to real citizen records; the URL's obscurity does not provide that separation. Do not invite real citizens to submit personal data during staging.

## Git and secret audit

The original preparation audit found an ignored local `server/.env`; its values were not printed or changed. At that time the project-scoped Git inventory contained zero tracked files/commits. The project was subsequently audited, committed, and uploaded to the dedicated repository. Source credential-pattern matches were documentation placeholders and clearly isolated synthetic test fixtures. Recheck the actual staged changes before each future push; this is not a statement about unrelated repositories or files.

The earlier parent-checkout layout was corrected by creating an independent `.git` inside the project, without changing the parent repository. The origin is <https://github.com/jawadshahen28/Dor_El_May>. Continue verifying `git rev-parse --show-toplevel` before publication, and do not publish a user-home parent checkout.

`.gitignore` excludes environment values, dependency/build directories, local caches and artifacts, cloud/SSH/editor credentials, private key containers, credential JSON files, logs, browser traces, and database dump/backup files. Only the empty `.env.example` templates are allowed. `package-lock.json` remains publishable and is required by `npm ci`.

Before any future commit/push, inspect the staged file list and rerun a secret scan without pasting values into logs or chat. Ignore rules do not protect a file already tracked or forcibly added. If a real credential has ever been published, rotate it with the provider and clean the affected history; deleting it only from the latest file is insufficient. No push or remote-history inspection was performed in this preparation task.

## Local verification

```powershell
npm run build
npm test
npm run test:db
npm run test:production
npm run test:ui
```

Database suites use disposable local MongoDB processes, overriding the application URI. `test:production` builds the frontend, starts the real production server entry point, and verifies route refreshes, asset/API boundaries, proxy-aware secure sessions, session survival after a process restart, database health failure, and reconnection after a database outage. It simulates HTTPS termination with forwarded headers; it does not provision a real certificate or Render service. Browser tests exercise the citizen/admin interfaces against the built frontend without changing their designs.

The test MongoDB process is started only by explicit test commands; the deployed server always uses the configured Atlas database. Test results are recorded in [VERIFICATION.md](VERIFICATION.md).

## Verify the eventual staging URL

1. Check `/api/health`: it should return HTTP 200 with JSON indicating a connected database. It creates no session and is excluded from rate limits. A failed database/session initialization or bounded database ping returns HTTP 503 in production, allowing Render to reject unhealthy instances. The production entry point refuses to start if the frontend build is absent. [Render HTTP health checks](https://render.com/docs/health-checks).
2. Open and refresh `/login`, `/guest`, `/home`, `/schedule`, `/announcements`, `/reports`, `/account`, `/admin`, and `/admin/login`. React page requests load the application shell; frontend guards then redirect unauthenticated users. Actual private data always requires an authorized API session. Confirm the real images, Arabic font, and RTL layouts appear normally.
3. Register a controlled citizen test account in a staging zone, log in, refresh, close/reopen the browser, and verify Home, schedule, announcements/details, report submission/history, and account profile. Empty official-data collections should show honest empty states. Confirm the phone and other account details belong only to the test account.
4. In browser developer tools, check the cookie `__Host-door.sid`: `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, and no `Domain`. Confirm no password, hash, or session token appears in localStorage. Verify cookies persist over a Render restart/redeploy with an unchanged secret and database.
5. A guest must receive 401 from `/api/admin/dashboard`, `/api/admin/water` and `/api/admin/water-rounds`; a citizen must receive 403. Log in through `/admin/login` using the explicitly created staging administrator, verify `/admin`, refresh, and check real statistics. Verify `/admin/water` and `/admin/schedule` refresh correctly. With deliberately isolated staging data, create a draft, publish it, start/end pumping, and verify citizen reads in a separate profile as described in [COUNCIL_WATER_MANAGEMENT.md](COUNCIL_WATER_MANAGEMENT.md). Four future-management placeholders remain disabled. Confirm administrator logout invalidates access and citizen authentication still works. No push notifications are sent; no additional deployment secrets are needed.
6. Check unknown `/api/...` returns JSON, never React HTML. Check missing `/assets/...` and requests for `/.env` or `/server/.env` return 404. Verify normal API errors remain safe JSON and contain no hashes, database URI, or internal stack trace.
7. Verify registration/login/logout/reports still enforce CSRF and the exact allowed origin. Test only controlled requests; do not disable origin, CSRF, secure-cookie, or rate-limit protections to make a check pass.

## Troubleshooting

### Linux native dependencies and lockfile maintenance

The original Windows-derived lockfile declared native optional dependencies but omitted their resolved Linux package records. On Linux x64 GNU this prevented Rollup's native loader from finding `@rollup/rollup-linux-x64-gnu`; equivalent records were also missing for Tailwind Oxide, Lightning CSS, and esbuild. This is consistent with npm's [platform-specific optional-dependency lockfile issue](https://github.com/npm/cli/issues/4828).

The repaired lockfile was generated by npm from the unchanged workspace manifests in a fresh temporary directory containing neither `node_modules` nor an old lockfile. It restores platform variants and registry integrity metadata, while preserving all existing resolved package versions. No platform-specific native package was added as a mandatory application dependency. Optional dependencies remain enabled. Render's build and start commands above are unchanged.

For future lockfile regeneration, use a similarly clean temporary directory and copy only the root and workspace `package.json` files. Generate metadata with `npm install --package-lock-only --ignore-scripts --include=dev --include=optional`, review version changes before adopting the result, and verify a clean `npm ci --include=dev` followed by the build. The metadata-only command skips lifecycle scripts only during regeneration; normal installation/build continues to run them. Do not regenerate from an existing platform-specific `node_modules` tree or omit optional dependencies.

`server/test/nativeDependencies.test.js` checks every declared build-native variant, including Linux GNU and Windows x64. `.github/workflows/native-build.yml` runs clean installation, unit tests, production build, and a lockfile-immutability check on Ubuntu and Windows using Node 24.22.1. Local Docker and WSL were unavailable when this fix was prepared; the workflow run for the pushed commit supplies the independent Linux build result.

| Symptom | Check |
| --- | --- |
| `npm ci` lock/workspace errors | Build from the repository root with all three workspaces and the committed lockfile. Do not upload `node_modules`. |
| Vite/Tailwind command missing | Use `npm ci --include=dev`; production mode otherwise commonly omits dev build tools. |
| `MODULE_NOT_FOUND` from Rollup's `dist/native.js`, Oxide, or Lightning CSS | Use the repaired complete lockfile, keep optional dependencies enabled, and verify the Ubuntu native-build workflow. If Render retained an old failed install, use its clear-build-cache redeploy action for the fixed commit. Do not add only a Windows binary or disable optional packages. |
| Test MongoDB download during installation | Keep the root `config.mongodbMemoryServer.disablePostinstall` setting. Deployment never needs that test binary. |
| Argon2 native-module error | Install dependencies on Render's Linux runtime using Node 24; do not copy Windows binaries or disable all install scripts. |
| Port detection/startup failure | Use `npm start`, `NODE_ENV=production`, host `0.0.0.0`, and platform `PORT`. Do not run Vite or the development watcher as the Web Service. |
| Missing production frontend | The build command must complete and produce `client/dist/index.html` before startup. Root Directory must be the workspace root. |
| Atlas timeout / unhealthy instance | Check staging outbound IP allowlist, DNS, TLS, exact URI/database, staging user's permissions, and cluster availability. Logs contain safe diagnostic categories only. Initial connection failure exits; Render can restart/retry. After an established connection drops, the MongoDB driver attempts recovery; readiness fails while unavailable. |
| Login succeeds but refresh loses identity | Check proxy trust, HTTPS forwarding, cookie attributes, unchanged `SESSION_SECRET`, MongoDB `sessions`, TTL permissions, and use of the same hostname. |
| Origin/CSRF rejection | Match `APP_ORIGINS` to the browser origin exactly; restart after configuration changes. Keep requests same-origin and retain the CSRF header/token flow. |
| Some users receive 429 together | Verify trusted client-IP forwarding for the real proxy path before changing any limits. Do not set unlimited proxy trust. |
| Registration cannot select a zone | The staging database is empty. Explicitly add an appropriate staging-only zone; do not copy citizen accounts or silently run the development seed. |
| Health check fails after a database outage | Restore Atlas connectivity; inspect safe service logs and wait for driver recovery/restart. Do not replace the readiness endpoint with a permanent HTTP 200. |

For each deployment, verify its commit, healthy API, exact public HTTPS origin, session behavior, and manifest/worker/icon delivery. PWA-specific checks and physical-device limitations are documented in [PWA.md](PWA.md); the historical preparation results below describe the earlier deployment-preparation phase.

## Preparation changes and results

Created: `.env.example`, `.node-version`, `RENDER_DEPLOY.md`, `server/test/deployment.test.js`, `server/test/production/deployment.test.js`.

Modified: `.gitignore`, `package.json`, `package-lock.json`, `server/.env.example`, `client/.env.example`, `scripts/setup-env.mjs`, `server/src/config/env.js`, `server/src/config/database.js`, `server/src/app.js`, `server/src/index.js`, `README.md`, `VERIFICATION.md`.

No citizen/admin page, stylesheet, model, password hash, database credential, or existing session was changed. Existing build/start scripts remain the deployment entry points. Added tests check configuration, empty templates, safe local setup, production static serving, authorization, secure cookies, restarts, and database recovery.

Verification: clean `npm ci --include=dev` and frontend build passed in an isolated Windows copy. Unit tests: **27 passed**; existing integration tests: **56 passed**; Chrome tests: **26 passed**; production smoke suite: **4 passed**. Total: **113 passed**, with no skipped tests. Nineteen representative secret/artifact paths were confirmed ignored, while the three blank example files and lockfile remain eligible for version control. The Windows MongoDB outage fixture flushes its own disposable database before the test helper forcibly stops it; no real Atlas database was used.
