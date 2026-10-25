# Web Push infrastructure — sending disabled

Arabic notification controls, encrypted authenticated device subscriptions, service-worker notification handling and a durable scheduled processor are implemented. **No real notifications were sent. Outbound delivery is disabled by default.** Web startup never starts a sender, generates deployment keys or requests permission automatically.

## Citizen controls and privacy

The citizen bell opens **تفعيل الإشعارات**, **إيقاف الإشعارات**, permission and this-device subscription status. Permission is requested from the enable-button click only. Unsupported/denied states explain the next step. On iPhone, install the HTTPS site on the Home Screen and open that installed app before enabling notifications; supported iOS/iPadOS versions start at 16.4. Installation itself grants no notification permission. See [WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

The server derives owner and neighborhood from the authenticated resident. Subscription mutations retain CSRF, exact Origin, JSON and role protections and add a 30/hour per-user write limit. Endpoint, browser encryption keys and the bound session ID are encrypted with AES-256-GCM and installation-specific authenticated data. API responses expose no subscription secrets. Unique hashed endpoint/installation indexes prevent duplicate records and takeover by a different installation; registration checks a ten-device account limit.

Logout and successful account replacement revoke that browser session's subscriptions. Failed login preserves the existing session. Local revocation clears the worker binding and attempts browser unsubscribe before network logout. An opaque persistent opt-out marker prevents failed/offline opt-out from automatically rebinding on revisit. A separate device/session remains independent. Fresh consent is required after an account switch.

The worker displays fixed Arabic copy only for supported, unexpired payloads matching the current opaque binding. Event tags and a bounded expiring ID store suppress repeat display. Click URLs are restricted to same-origin Home, Schedule and announcement routes. An existing matching window is focused; other tabs/forms are preserved by opening the destination separately. Ordinary React and server session checks handle expired accounts.

CacheStorage still contains approved public static assets only; all APIs remain network-only/no-store. The separate IndexedDB store holds only an opaque binding and at most 256 expiring event IDs. No citizen profiles, API responses, subscription endpoints, encryption keys or notification bodies are stored there. localStorage contains only a random device identifier and opt-out preference, not account/session tokens. Push is not an offline source of current official pumping information.

## Models and API

| Model | Purpose |
| --- | --- |
| `PushSubscription` | Encrypted browser subscription, authenticated owner, hashed device/endpoint/session links, binding generation, consent/last-seen/expiry and active status. |
| `PushEvent` | Unique projection of a durable source event, campaign, zone, expiry and fan-out cursor. |
| `PushDelivery` | Unique `(eventId, subscriptionId)` ledger, binding snapshot, leases, attempts, retry time and sanitized outcome. |
| `PushWorkerState` | Fresh campaign activation cutoff, exclusive lease and provider-configuration pause. |

| Endpoint | Contract |
| --- | --- |
| `GET /api/notifications/config` | Resident only; configuration/sending flags, worker protocol and public VAPID key only. |
| `GET /api/notifications/subscription` | Resident only; opaque `X-Push-Device` header identifies this installation. Returns active status/binding only; no query credentials. |
| `POST /api/notifications/subscription` | Resident + CSRF/Origin; exact `{ deviceToken, subscription }` body. Browser subscription has endpoint, p256dh/auth keys and optional expirationTime. |
| `DELETE /api/notifications/subscription` | Resident + CSRF/Origin; exact `{ deviceToken }` body. Revokes only the current owner's installation. |

Tokens are random 256-bit installation identifiers. Keep them out of URLs and logs. The browser owns its native PushSubscription. Subscription status/registration is not proof that the OS will display notifications.

## Events

| Event | Trigger and audience | Fixed message / destination |
| --- | --- | --- |
| Schedule published | Existing first explicit draft publication; subscribed active residents in that Zone | **دور المي 💧** — تم الإعلان عن موعد جديد لدور المياه في حارتك. اضغط لعرض التفاصيل. → `/schedule` |
| Pumping started | Existing first explicit scheduled → pumping transition; subscribed active residents in that Zone | **بدأ ضخ المياه 💧** — أعلن مجلس قروي تلفيت بدء ضخ المياه في حارتك. → `/home` |
| Announcement published | Future first explicit official publication with an atomic intent; subscribed active residents village-wide | Generic official announcement → `/announcements/:id` |

`WaterRound.notificationEvents` remains the sole producer for the first two events. There is no duplicate producer or historic backfill. Drafts, edits, completion, cancellation and refreshes emit nothing. The sender rechecks source state, current resident role/status/neighborhood, subscription binding/consent/key version and an unexpired MongoDB session with the current signing-key fingerprint before transport. Stale sources or changed/ineligible recipients are skipped. Payloads contain only event type, opaque event/binding IDs, expiry and an announcement ID when needed. Lock screens contain no citizen name, phone, zone name, report, password or session token.

`Announcement` now supports private intents; `announcementNotificationIntent(id, now)` supplies the future publisher hook. That future authorized publish operation must atomically set status/publication time and append the intent in one conditional update matching `status: draft` and `publishedAt: null`. No announcement management API/UI was added; already-published legacy announcements intentionally generate nothing.

## Exact new environment variable names

These settings are optional while push is unconfigured/disabled. Existing database/session/origin settings are unchanged. Safe `.env.example` files contain names only.

| Variable | Meaning |
| --- | --- |
| `PUSH_OUTBOUND_ENABLED` | Defaults false. Keep **false** until isolated staging, consenting accounts/devices and explicit test authorization are verified. Only the explicit processor can send. |
| `VAPID_PUBLIC_KEY` | Stable base64url P-256 public key; supplied through the authenticated API, with no frontend build variable. |
| `VAPID_PRIVATE_KEY` | Matching private key, in server/worker secret storage only. |
| `VAPID_SUBJECT` | Valid Council contact mailto or external HTTPS URI; avoid localhost. |
| `PUSH_SUBSCRIPTION_KEY` | Separate 32-byte base64url AES-GCM key. Losing/changing it makes old subscription ciphertext unreadable. |
| `PUSH_CONFIRMED` | Defaults false. Operator confirmation to enable delivery on the configured database. (`PUSH_STAGING_CONFIRMED` also accepted). |
| `PUSH_DATABASE` | Exact database name matching the connected database (`dor_el_may` or a staging/test database name). (`PUSH_STAGING_DATABASE` also accepted). Does not alter `MONGODB_URI`. |
| `PUSH_TEST_USER_IDS` | Optional comma-separated ObjectIds of consenting residents for restricted testing. When omitted or empty, delivery operates normally for all subscribed residents in the relevant neighborhood. |
| `PUSH_DELIVERY_NOT_BEFORE` | Fresh ISO instant for the authorized campaign. Only events strictly after both this instant and the first enabled-run activation are eligible. |

When `PUSH_TEST_USER_IDS` is omitted, the worker operates normally for all subscribed active residents belonging to the published/pumping water round's neighborhood. Configuring an allowlist is optional and reserved for restricted testing.

The optional explicit command `npm run push:keys` writes fresh keys to ignored `.local/push-staging.env`, prints no secret values, refuses overwrite and leaves `server/.env` unchanged. It is never called by build/start/deploy. Transfer values privately to authorized staging secret settings, never chat/Git/logs/command arguments. No deployment keys were generated here; key-helper tests used disposable ignored fixture folders only.

## Durable Render processing

The existing Web Service commands remain:

```text
npm ci --include=dev && npm run build
npm start
```

Prepare a separate **Render Cron Job**, repository root directory, build **`npm ci --include=dev`**, command **`npm run push:process`**, schedule **`* * * * *`** (UTC). No service/job was created here. Cron has separate billing; review it before provisioning. A dedicated continuously running worker is an alternative requiring separate configuration. The sleeping Web Service's timers are not used. See [Render Cron Jobs](https://render.com/docs/cronjobs) and [Background Workers](https://render.com/docs/background-workers).

The Cron Job requires the same isolated staging `MONGODB_URI`, existing `SESSION_SECRET` to validate bindings, existing configuration required by `loadConfig`, and the push variables above. Keep outbound disabled on both services until authorization. Never copy real residents or real database credentials into staging.

One run handles bounded work: up to 100 new intents per source, 20 events with 100-device fan-out pages, and 20 delivery attempts within a 45-second processing budget. Transport has an eight-second total abort timeout, public-only DNS-pinned HTTPS and a fixed provider allowlist, with no redirects/proxy configuration. Leases last 90 seconds and recover after crashes; unique indexes, persisted cursors and conditional claims prevent duplicate jobs. The first enabled run only arms a new campaign and sends nothing. Historical events are excluded even with an older configured cutoff.

Publication/announcement events expire after one hour; pumping events after 15 minutes. Transient network/429/5xx failures retry with bounded exponential backoff, jitter and Retry-After, at most five attempts before expiry. Terminal 404/410 disables the subscription. Provider 401/403 pauses the campaign for 15 minutes without deleting subscriptions. Logs/ledger store only sanitized outcome codes/counts, not provider bodies or credentials.

Subscription expiry or 45 days without a valid revisit causes deactivation during enabled processing; revoked records expire after 30 days. Events/deliveries expire seven days after event expiry. Worker event IDs expire with the event and are capped at 256.

**Exactly-once external delivery cannot be guaranteed:** provider acceptance followed by a crash/timeout can cause retry. Deterministic tags and worker IDs suppress redisplay where storage remains available. Provider/OS policies, Focus/battery settings, revoked permissions, scheduling delays and offline expiry also affect delivery. Acceptance is not proof of physical display; in-flight/already-delivered generic notifications cannot always be recalled after logout. No payload contains citizen personal information.

## First authorized staging test — do not execute yet

1. Verify Atlas and Render use a separate staging database and restricted dedicated credentials, with no copied real residents. Verify the future job uses that same staging configuration. A name/flag is not sufficient proof. Do not alter real deployment credentials to experiment.
2. Create exactly two dedicated consenting resident accounts in known test zones: one Android tester and one iPhone tester. Keep their ObjectIds private for the allowlist. Obtain consent and the user's **explicit authorization** for real delivery. No accounts are created/copied automatically.
3. Generate separate staging keys with the optional helper, set a valid Council subject, configure the Web Service's key variables and keep `PUSH_OUTBOUND_ENABLED=false`. Deploy the safe commit and accept the app update; old active worker protocols are rejected by the client.
4. Android: open the HTTPS site in Chrome, sign in as the tester, open the bell and press **تفعيل الإشعارات**, then allow the real browser permission. iPhone: install on Home Screen, open that app, sign in as its tester and enable from the bell. Verify subscription status; sending still remains stopped.
5. Check owner/status records without printing ciphertext, endpoint keys, private keys or session material. Test opt-out and logout/relogin, then explicitly opt back in. Installation alone is insufficient.
6. Only after verified isolation and explicit authorization, configure the Cron Job with the exact staging database, confirmed flag, the two tester IDs, a fresh cutoff and `PUSH_OUTBOUND_ENABLED=true`. Run once to arm: expect `armed: true` and zero sends. Do not backdate or replay old events.
7. After arming, create a **new isolated test draft** through the Council account. Draft/edit must send nothing. Publish for the Android tester's zone: only opted-in allowlisted testers in that zone should receive the schedule message. Start pumping on that test round: expect the pumping message. End it: expect none. Repeat deliberately for the iPhone tester's zone. No actual physical pump or real citizen data is needed for these staging records.
8. Verify foreground/background/closed-app display, repeated processing, click with expired login, denied/revoked permission, opt-out, account switching, offline then online, and expired events. Announcement transport is mock-tested; its management UI/publication API is future work.
9. Inspect sanitized worker counts/ledger and actual device displays, then return `PUSH_OUTBOUND_ENABLED=false` on the job/Web Service and unsubscribe test devices. Record physical device/OS/browser results separately. Do not enable general citizen delivery as a side effect.

No physical Android/iPhone delivery was performed or claimed. Live database isolation, deployment keys, Cron provisioning and explicit real-test authorization remain unverified/pending.

## Tests and files

Run `npm test`, `npm run test:db`, `npm run test:production`, `npm run test:ui`. Integration tests use disposable MongoDB, ephemeral keys and injected mock transports only. Browser notification tests mock Notification/PushManager and inject trusted synthetic push events through CDP into the production worker; showNotification is an in-memory recorder, so no native/provider notification is sent. Existing citizen/admin/council/PWA tests run separately with unchanged production limits.

New: `server/src/config/push.js`, `models/PushSubscription.js`, `models/PushDelivery.js`, `routes/notificationRoutes.js`, services `pushSubscriptions.js`, `pushTransport.js`, `pushProcessor.js`, `process-push.js`, `scripts/generate-push-keys.mjs`, `shared/push.js`, `client/src/notifications/{pushClient.js,NotificationControls.jsx,notifications.css,workerPush.js}`, unit/integration/browser push tests and this guide.

Updated: authentication/session revocation integration, app/config/index/rate-limit wiring, private source-event indexes and announcement intent storage, shared exports, dependencies/cross-platform lockfile, service worker and bell, safe environment templates, isolated browser fixtures/runner/regression expectations, and readiness/deployment/verification documentation. Existing native dependency versions/integrities were preserved; npm audit reported zero vulnerabilities.
