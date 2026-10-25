# Web Push implementation and readiness

Phase 3 Prompt 3 implemented Arabic opt-in/opt-out controls, encrypted authenticated subscriptions, durable processing with retries/leases, and service-worker push/click/deduplication handling. **Real outbound sending remains disabled by default and has not been authorized or tested on physical devices.**

See [WEB_PUSH.md](WEB_PUSH.md) for the current API/models, exact environment names, Render Cron command, safety gates and Android/iPhone staging procedure. The first enabled run arms a fresh campaign and sends nothing; processing is restricted to a confirmed isolated staging database and consenting allowlisted accounts. Historical events are not replayed. The future announcement publisher still needs its atomic event hook; no announcement management UI/API was added.

The findings and plan below are retained as historical **pre-implementation** context, not current source status.

## Historical audit — before Phase 3 Prompt 3

Audit date: 2026-10-25. **Real Web Push is not implemented or enabled.** Installing this PWA does not subscribe a citizen or grant notification permission. No real notification was sent, no VAPID key was generated, and no live subscription/resident database was used in testing.

### Historical implementation findings

| Area | Exact current status |
| --- | --- |
| Bell | `HomeHeader.jsx` opens `HomeDialog.jsx`, which honestly labels notifications as a future service. It has no subscription behavior. |
| Permission | No `Notification.requestPermission` call, permission-state UI, or opt-in exists. |
| Registration | No `PushManager.subscribe`, `getSubscription` synchronization, subscription API, or unsubscribe flow exists. |
| Storage | No subscription model, endpoint/encryption-key storage, owner association or retention/cleanup exists. Existing accounts/sessions are not push subscriptions. |
| VAPID | No VAPID configuration is read by the code; no new environment variable is required for this delivery. |
| Delivery | No `web-push` dependency, push sender, delivery worker, retry queue, or outbound push call exists. |
| Service worker | `client/src/sw.js` handles installation, activation, explicit updates and static/API fetching. It has no `push`, `notificationclick` or `pushsubscriptionchange` handler. |
| Manifest | Existing Arabic RTL manifest, standalone display, stable root ID/scope and icons support installation. These do not enable push. |
| Failures/duplicates | No delivery exists to clean up or deduplicate. The new water management transitions record unique durable event intents; delivery deduplication remains future work. |
| Announcements | Published announcements are readable. There is no Council announcement-write API/UI yet; Event C must be added with its future official publish operation. |

No change to the bell, permission prompts, worker cache security or current notification behavior is made here.

## Event contract prepared now

`WaterRound.notificationEvents` is an internal, non-API array. Each entry contains a deterministic `key`, `type`, `zoneId` and server `occurredAt`. Its append is atomic with the successful state transition, so no crash window exists between changing the round and recording that event. Revision/state checks prevent repeated append; legacy rounds are not backfilled.

| Event | Trigger and stable key | Future audience and destination |
| --- | --- | --- |
| A: Schedule published | First explicit draft publication; `water-round:<id>:schedule_published` | Opted-in active resident accounts registered in the recorded zone; `/schedule`. |
| B: Pumping started | First explicit published scheduled → pumping transition; `water-round:<id>:pumping_started` | Opted-in active residents in that zone; `/home`. |
| C: Council announcement | **Not yet recorded**. Future first official announcement publication must atomically append `announcement:<id>:published` to its own document. | Opted-in active resident accounts village-wide; `/announcements/<id>`. |

Creation of a draft, date/time edits, reads/refreshes, cancellation and pumping completion emit nothing. Published-round neighborhood changes are disallowed; a correction uses cancellation and a new round. Edits do not reset the publication identity. A repeated publish/start request returns 409 and cannot create another event. The current intent array has no dispatch state and no background consumer: it is a durable source for a future outbox projection, not an operational notification queue.

## Proposed subscription implementation

1. Add explicit Arabic **تفعيل الإشعارات** / disable/status controls, using feature detection for service workers, `PushManager` and `Notification`. Ask permission only after an intentional user gesture, never on installation, login, refresh, or bell opening. Handle default, granted, denied, unsupported and pending states honestly without repeatedly prompting.
2. Use the existing root service-worker registration. Subscribe with `userVisibleOnly: true` and the deployment's public application-server key. Synchronize an existing subscription on an authenticated revisit; permission may have changed externally. The [W3C Push API](https://www.w3.org/TR/push-api/) describes this independent permission/subscription lifecycle.
3. Add same-origin, authenticated resident subscription registration/removal routes protected by the existing CSRF, Origin, JSON limits and rate limiting. Derive the user and neighborhood from the session/database, never from a supplied user ID or role. Enforce bounded subscription counts and validate endpoint/key sizes and encodings. Accept HTTPS push-provider endpoints only; protect the eventual sender against SSRF, internal/private destinations, arbitrary redirects and unexpected providers, including DNS resolution checks at send time.
4. Introduce a dedicated subscription model with an endpoint hash as a unique lookup key, restricted encrypted endpoint and `p256dh`/`auth` values, owner/installation ID, consent timestamp, key version, status and last-seen timestamps. Keep capability URLs and keys out of logs, list APIs, exports and public responses. Scope access to the owner; an endpoint must have one active account owner. The [Web Push protocol](https://www.rfc-editor.org/rfc/rfc8030.html) treats subscription URLs as capabilities.
5. Explicitly detach/disable the current installation on logout and before account replacement, then unsubscribe locally; rebind only after fresh consent/account synchronization. Revalidate active resident status and current neighborhood before each send. Test offline logout/revocation and shared-device account changes. Display only generic official information on lock screens, never citizen names, phones, reports, credentials or session tokens. Already-delivered notifications cannot reliably be recalled across devices.
6. Provision a stable staging VAPID key pair and valid Council contact subject securely, separately from future production keys. Only the public key is exposed to the authenticated client. Private key/endpoint encryption material must stay in server secret storage; never generate replacements on startup or commit keys. Define exact configuration variable names during that implementation and update safe templates then; none are added speculatively now. The maintained [Node Web Push library documentation](https://github.com/web-push-libs/web-push) describes the VAPID and encrypted-payload interface.

## Reliable dispatch and duplicate prevention to implement

1. Project allowed fresh source intents into an outbox with a unique `eventKey`. Use insert-if-absent/upserts and a durable scan cursor with overlap so a restart can rescan safely. The source document already contains the atomic event; MongoDB transactions are not required for the projection. Add equivalent atomic source-event handling to future announcement publication.
2. Choose an explicit enablement cutoff and short event-specific expiry. **Do not replay historical intents created during this non-delivery phase.** No automatic copying of citizens or subscriptions into staging. A test campaign must be limited to explicitly consenting staging accounts/devices, never real residents.
3. Resolve recipients server-side from the recorded zone for A/B, or all active residents for C. Persist a bounded recipient snapshot with consent existing at the event time, then recheck subscription ownership, active account, opt-in and current zone before sending. Re-evaluate the source state: skip a cancelled round, an already-ended pumping event, withdrawn announcement, stale event or changed/disabled recipient.
4. Use a delivery ledger with a unique `(eventKey, subscriptionId)` index. Multiple subscribed devices intentionally receive one copy each; one subscription must not be listed twice. Claim pending deliveries atomically with a time-limited lease, attempt count and worker ID. Use bounded batches, concurrency, timeouts and backoff; retry transient network/429/5xx failures with jitter and `Retry-After`. A reliable scheduled/background worker must be configured deliberately; a sleeping Render Web Service timer alone is insufficient.
5. Mark successful provider acceptance separately from device display. Disable/remove expired subscriptions on terminal 404/410, and stop retrying permanent validation failures. Do not treat 401/403 VAPID/configuration failures as mass subscription expiry; alert and pause the sender instead. Store only sanitized error classes/status codes and aggregate counts. Add retention/TTL policies for expired delivery records and inactive subscriptions.
6. A unique event and ledger prevent duplicate jobs, but **an external push acceptance followed by a crash or response timeout cannot guarantee exactly-once delivery**. Use deterministic notification tags and event IDs, plus a minimal bounded expiring event-ID deduplication store in the worker, to suppress redisplays after transport retry. It must store no account/report payloads and must not change the static-only API caching policy. Test the crash/ack boundary explicitly; do not promise mathematically exact-once network delivery.

## Service worker and navigation to implement

- Add `push` handling to the existing worker, using `event.waitUntil`, bounded payload validation and `registration.showNotification`. Include Arabic `lang`/RTL, the existing icon, deterministic tag/event ID and a same-origin relative destination. A push is a notification that data changed, not an offline authoritative pumping status.
- Add `notificationclick`: close the notification, validate the destination against approved same-origin routes, focus an existing app client or open a new one. Normal app authentication/role checks still control access; clicks must not bypass login. Test cold/closed tabs and lost/expired sessions.
- Reconcile subscription changes/revocation on app open and where supported through `pushsubscriptionchange`. Do not rely on that event alone, because a worker may lack a valid authenticated session. Never place an auth token in the worker or subscription payload.
- Keep all API requests network-only/no-store and keep personal data out of CacheStorage. Notification handling must coexist with the current explicit update prompt and non-disruptive form behavior.

## Android / iPhone acceptance gate

Use an isolated staging database, dedicated credentials and consenting test accounts/devices. Unit/integration tests should fake the transport, not call public push services. Cover every event, audience isolation, drafts/edits/end producing no events, concurrent workers, retries, stale state, logout/account switching, disabled accounts, subscription re-registration, 404/410 cleanup, invalid VAPID, expiry and duplicate display suppression.

On Android Chrome, verify permission granted/denied/revoked, installed and browser contexts, foreground/background/closed app, device offline then online, and safe notification clicks. On iPhone/iPad, use an actual Home Screen installation on a supported OS (Web Push support starts at iOS/iPadOS 16.4), launch that app, and request permission from a user action. Apple's [WebKit documentation](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) explains this requirement; browser installation alone is insufficient. Verify Focus/notification settings, closed-app delivery and click-to-authentication behavior. Cross-platform browser emulation cannot establish OS notification delivery.

Enable real sending only after these pieces are implemented, staging transport/device tests pass, the Council reviews notification copy/consent/retention, and activation is explicitly authorized. Current code remains non-delivering, and no physical Android/iPhone push result is claimed.
