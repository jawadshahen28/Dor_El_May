# Council water management

The existing Council shell now links to `/admin/schedule` and `/admin/water`. Citizen layouts, authentication, MongoDB connection settings, sessions, Origin/CSRF protection, and PWA cache policy remain unchanged. These controls record Council decisions; they do not operate physical pumping equipment.

## Administrator workflow

1. Sign in at `/admin/login` with an authorized active administrator account. No new account is created automatically.
2. Open **جدول المياه**. Select an active MongoDB neighborhood, a valid calendar date, and optionally a wall-clock time. Select **حفظ المسودة**. This saves a scheduled, unpublished `WaterRound`; citizens cannot see it.
3. Review the round in **الأدوار الحالية والسابقة**. Select **نشر الدور**, then confirm. Its publication timestamp comes from the server. A published round appears on citizen Schedule after refresh; Home includes it under its existing upcoming-date rules. A past timed round is still visible in Schedule but is not a future Home appointment.
4. Open **إدارة الضخ**. Select the existing published, scheduled round, select **بدء الضخ**, and confirm only after verifying actual pumping. The server records `pumping`, the actual start instant, and the authenticated administrator ID. An appointment alone never starts pumping.
5. Select **إنهاء الضخ** on the active round and confirm. The server records `completed`, actual end instant, and responsible administrator. The round leaves Home's active list after refresh and appears in recent history.

Multiple rounds and zones can be active, as permitted by the original model. Each selected round transitions once. The model does not impose a new one-active-round-per-zone constraint on existing data; administrators must choose the correct round. There is no physical pump integration or automatic clock-based start.

## Editing, cancellation and dates

- Drafts can change neighborhood, date, and optional time. Published rounds can change their date/time while still scheduled. Their published neighborhood is fixed to preserve the official audience/event identity; cancel an incorrect published round and create a correct replacement.
- Only unstarted scheduled rounds can be cancelled. Published cancellations remain visible as cancelled in citizen Schedule; cancelled drafts remain private. A pumping round must be ended, and a completed/cancelled round cannot be restarted, edited or republished.
- Creation/editing requires an existing active Zone. Publication/start also check that the referenced Zone is active. Existing inactive/missing references remain readable for administrative history, and an active legacy round can still be ended.
- Dates use the existing `YYYY-MM-DD` Palestine calendar representation (years 1900–9999); optional times use `HH:mm` or null. Impossible dates, invalid leap days, malformed times and timezone-bearing timestamps are rejected. Actual instants display using `Asia/Hebron`, independently of the device timezone. Past calendar dates are permitted for Council record keeping.
- The monthly schedule supports current/previous months, neighborhood, status, publication filters, and 50-row pagination. The pumping page separately paginates eligible rounds and recent completed/cancelled history. Active rounds are all shown.
- Refresh and revisit re-read the database. There is no push/SSE live-update channel: citizens receive changed state on refresh/revisit under their existing page behavior.

## API contract

All endpoints below require the existing database-backed active `admin` or legacy `council_admin` role. Every mutation also requires the existing JSON, CSRF and trusted-origin protections. Responses retain the standard envelope and `Cache-Control: no-store`.

| Method / endpoint | Contract |
| --- | --- |
| `GET /api/admin/water-rounds` | Optional `month=YYYY-MM`, `zone=all/ObjectId`, `status=all/scheduled/pumping/completed/cancelled`, `publication=all/draft/published`, `page=1..99999`. Defaults to the current Palestine month. |
| `GET /api/admin/water` | All active rounds, eligible published scheduled rounds, recent history. Optional independent `scheduledPage` and `historyPage`. |
| `POST /api/admin/water-rounds` | `zoneId`, `scheduledDate`, optional `scheduledTime`, and a fresh UUID `requestId`. Always saves a draft. Returns 201 on creation or 200 for an identical retry. |
| `PATCH /api/admin/water-rounds/:id` | `revision`, `zoneId`, `scheduledDate`, optional `scheduledTime`. Edits an eligible scheduled round. |
| `POST /api/admin/water-rounds/:id/publish` | `{ revision }`; publishes a draft once. |
| `POST /api/admin/water-rounds/:id/start` | `{ revision }`; starts an officially published scheduled round once. |
| `POST /api/admin/water-rounds/:id/end` | `{ revision }`; completes a pumping round once. |
| `POST /api/admin/water-rounds/:id/cancel` | `{ revision }`; cancels an unstarted scheduled round once. |

Unknown/body/query fields, duplicate query parameters, noninteger revisions, and client-supplied identities/status/timestamps are rejected. IDs are validated before querying. A missing round returns 404; invalid input returns 422; a stale revision or invalid/repeated transition returns 409 `ROUND_CONFLICT`. The UI disables pending actions and refreshes after a conflict rather than silently retrying a state change. Creation reuses its request key after uncertain network failure so an identical retry cannot create a second round.

## Atomicity and compatibility

`WaterRound` adds a revision, responsible actor IDs, cancellation timestamp, internal action audit, creation idempotency metadata and internal notification event intents. Older records without these fields work with revision zero and receive metadata only when changed; no backfill, seed, deletion or credential change is required. A new partial unique index covers only string `creationKey` values, leaving existing records unaffected. Creation waits for model/index initialization before accepting a request.

Each transition compares both the current revision and eligible state in one `findOneAndUpdate`. The new state, server timestamp, actor, revision increment, audit append and optional event intent are written atomically to the same document. Concurrent publish/start/edit/cancel requests cannot silently replace each other. Creation keys are scoped to the authenticated administrator and protected by the partial unique index; reusing a key for different content returns a conflict.

Internal audit, request fingerprints and notification intents are excluded from API DTOs, including citizen reads. No administrator identity is accepted from the client. The original publication rules, registered-neighborhood next-round query and explicit pumping status continue to drive citizen Home, Schedule and admin Dashboard.

Schedule publication and pumping start record deterministic internal event keys. The separate processor can consume fresh eligible intents after explicit staging activation; outbound sending is disabled by default. Draft/edit/end/cancel actions produce no notification event. Announcement publication is future work; see [WEB_PUSH.md](WEB_PUSH.md) and [NOTIFICATION_READINESS.md](NOTIFICATION_READINESS.md).

## Verification and deployment

Run `npm test`, `npm run test:db`, `npm run test:production`, and `npm run test:ui`. Tests use disposable local MongoDB and synthetic accounts, never Atlas or live residents. The UI command builds once, then runs the existing regression group and Council workflow group with separate disposable servers so the enlarged suite does not exhaust one shared IP's real 300-request window. No production limiter is changed or bypassed. Optional Playwright arguments can be supplied after `npm run test:ui --`. The new integration suite covers authorization, CSRF/Origin, date/time/zone validation, draft privacy, publication, idempotent creation, stale revisions, concurrent transitions, multiple zones, ending, cancellation, legacy records, pagination and real citizen reads. Chrome tests exercise the real create/publish/start/end flow in separate administrator and citizen contexts, mobile/desktop layout, confirmations, draft editing/cancellation, conflict recovery and expired sessions.

Build/start commands remain `npm ci --include=dev && npm run build` and `npm start`. No new environment variable or production secret is required. Keep notification delivery disabled. Verify the staging build and public route/assets/health after deployment, then use deliberately created staging accounts/data for a Council acceptance test; do not experiment on real residents or create official rounds merely to verify deployment.

## Files

New: `server/src/services/councilWater.js`, `client/src/pages/admin/AdminLayout.jsx`, `AdminSchedulePage.jsx`, `AdminWaterPage.jsx`, `CouncilWaterComponents.jsx`, `server/test/integration/councilWater.test.js`, `tests/council-water.spec.js`, this guide, and `NOTIFICATION_READINESS.md`.

Updated: `WaterRound.js`, `adminRoutes.js`, `AdminRoutes.jsx`, `AdminDashboardPage.jsx`, `App.jsx` page titles, `admin.css`, the isolated browser test fixture, admin navigation/domain-route regression expectations, production-route tests, and existing README/admin/schedule/deployment/verification documentation. `scripts/run-browser-tests.mjs` and the root `test:ui` script isolate the browser groups.
