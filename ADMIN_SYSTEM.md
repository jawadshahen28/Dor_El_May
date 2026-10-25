# Council Administration — Phase 3, Prompt 1

The Council area lives inside the existing React/Vite and Express application. It uses the same configured MongoDB database, User collection, Argon2id password hashing, connect-mongo session store, cookies, CSRF/origin protections, Arabic font, official logo, and original village photograph. No application administrator was created during implementation or tests.

## Create the first administrator

From a local, interactive PowerShell terminal in the project directory:

```powershell
npm run admin:create
```

The command loads the existing `server/.env`, independently of the shell directory. It does not require the web server or a new session secret. Keep the existing database credentials and `SESSION_SECRET` unchanged. A process-level `MONGODB_URI` takes precedence over the file; the command reports the configuration source and warns about an override without printing its value.

Enter the administrator's full name (at least two words, maximum 100 characters), a valid local mobile number beginning with 05, and a unique password of 12–128 characters containing an English letter and a number. Password and confirmation input are hidden. Type `CREATE` when prompted to write the account to the configured application database, or press Ctrl+C to cancel.

Passwords cannot be supplied through command-line arguments, redirected input, or environment variables. The command rejects noninteractive terminals. Use a regular PowerShell window if an IDE's output panel lacks a TTY. No default credentials exist. The command creates an active `admin` user without requiring a citizen neighborhood. A canonical unique phone index prevents duplicates, including Arabic digit variants and concurrent creation attempts. If the phone already belongs to any citizen or administrator, creation fails without changing that account. Use a different authorized phone for the admin account. No public registration, promotion endpoint, or startup seed creates administrators.

## Open locally

```powershell
npm run dev
```

- Login: <http://127.0.0.1:5173/admin/login>
- Dashboard: <http://127.0.0.1:5173/admin>

Guests and citizens visiting `/admin` are redirected to `/admin/login`. Visiting or unsuccessfully submitting the admin form preserves an existing citizen session. Successful login establishes one authenticated identity per browser cookie, regenerates the session ID and CSRF token, and replaces the prior identity in that browser. Use separate browser profiles to keep a citizen and administrator signed in simultaneously. Other browser/device sessions remain unaffected. Existing citizen sessions retain their IDs and remain valid without migrations or secret changes.

## Authentication and authorization

- Existing User roles now accept `admin`, retain legacy `council_admin`, and default to `resident`. Status is `active` or `disabled`; records predating status default to active when read, without a database rewrite. Resident neighborhood validation remains required.
- Citizen registration always assigns `resident`, irrespective of client role/status fields. Citizen login only authenticates residents; administrators use the dedicated form.
- Every protected admin endpoint loads the user from the database, checks active status, and checks the current server-side role. A role change or disabled/deleted account removes access immediately. No client role, localStorage entry, or session-stored role authorizes access.
- Admin login uses existing Argon2id parameters, a dummy hash for unknown phones, generic invalid-credential errors, and separate MongoDB-backed limits of 25 requests per IP and 10 per normalized phone per 15 minutes. These persist across server restarts and do not consume the citizen login allowance. The existing general API limit still applies.
- Existing `HttpOnly`, `SameSite=Lax`, rolling expiration, host-only cookies, production `Secure` settings, CSRF checks, exact origin allowlist, CSP, and no-store API responses remain in effect. Logout destroys the server-side session and expires the cookie.

## API

All responses use the existing `{ success, data }` / `{ success: false, error }` envelope. Obtain the session CSRF token through the existing `GET /api/auth/me`. Send the same-origin JSON and `X-CSRF-Token` on login/logout.

| Endpoint | Access and response |
| --- | --- |
| `POST /api/admin/login` | Phone/password; rotates the session and returns safe user data and new CSRF token. |
| `GET /api/admin/me` | Active administrator only; safe admin profile. |
| `GET /api/admin/dashboard` | Active administrator only; read-only dashboard data. |
| `POST /api/admin/logout` | Active administrator and valid CSRF only; destroys the session. |

Dashboard response fields: `admin`, `statistics` (`registeredCitizens`, `activePumpingRounds`, `upcomingWaterRounds`, `newReports`, `publishedAnnouncements`), `activeRounds`, `upcomingRounds`, `recentReports`, `waterLastUpdatedAt`, `generatedAt`, `timeZone`.

Citizen counts exclude both admin role names and include legacy records without a stored role. Pumping is based exclusively on an explicitly published `pumping` status, never scheduled clock times. The pumping counter counts rounds. Upcoming rounds use the same shared filter as citizen Home: published by the query time, `scheduled`, after the current Asia/Hebron calendar day, or later on that day; unknown times remain eligible throughout their date. Draft, unpublished, future-published, overdue timed, completed, and cancelled rounds are excluded. Missing zone references cannot inflate round counts or consume preview slots. Existing inactive zone references remain readable.

Upcoming totals and the next five rows share one MongoDB aggregation/facet. Announcements must be `published` with a nonfuture publication date. New reports have status `new`; recent reports return the five latest by creation time and stable ID. Their DTO includes only ID, type, zone name/ID, submission timestamp, and status. It excludes citizen identity, phone, description, and submission metadata. No password hashes, database/session secrets, or draft contents are returned.

Actual event timestamps display in `Asia/Hebron`; scheduled dates/times retain their existing calendar/wall-clock meaning. Empty collections yield real zero counters and empty lists. Network failures display an error/retry state rather than invented zeros. The header shows the authenticated administrator; refresh and page revisit reload the database data. Authorization failures remove protected content and recheck authentication.

## Layout and future scope

The separate RTL administrative shell has a persistent right sidebar on desktop, Council header, five statistics cards, pumping status, upcoming rounds, recent report summaries, and data-read timestamps. Below 1100px, a native modal drawer supplies focus trapping, Escape dismissal, focus restoration, and mobile navigation. Water and schedule links are functional; the four other future sections remain disabled and labeled `قريبًا`.

Water management is now implemented in [COUNCIL_WATER_MANAGEMENT.md](COUNCIL_WATER_MANAGEMENT.md), using `/admin/water` and `/admin/schedule`, revision-checked write APIs, server-side actor/time auditing, and private drafts. The dashboard shares the unchanged shell and its original visual design. Report status updates, announcement publishing, citizen management, profile editing, password resets, outbound notifications, staff permissions and Council settings remain future work. See [NOTIFICATION_READINESS.md](NOTIFICATION_READINESS.md) for the exact push status and implementation plan.

## Files

Created:

- `server/src/controllers/adminAuthController.js`
- `server/src/routes/adminRoutes.js`
- `server/src/services/adminAccounts.js`
- `server/src/services/adminDashboard.js`
- `server/src/utils/admin.js`
- `server/src/create-admin.js`
- `client/src/pages/admin/AdminRoutes.jsx`
- `client/src/pages/admin/AdminLoginPage.jsx`
- `client/src/pages/admin/AdminDashboardPage.jsx`
- `client/src/styles/admin.css`
- `server/test/adminCli.test.js`
- `server/test/integration/admin.test.js`
- `tests/admin.spec.js`
- `ADMIN_SYSTEM.md`

Modified:

- `package.json`, `server/package.json`: explicit local creation command.
- `server/src/models/User.js`: compatible roles, account status, resident-only neighborhood requirement.
- `server/src/models/CitizenReport.js`: indexes for admin report count and recent preview.
- `server/src/app.js`: admin router mounting.
- `server/src/controllers/authController.js`, `server/src/middleware/auth.js`: role/status checks.
- `server/src/middleware/rateLimits.js`: independent admin login limits.
- `server/src/services/waterRoundRead.js`, `server/src/services/homeSummary.js`: shared unchanged upcoming/publication rules.
- `client/src/App.jsx`, `client/src/context/AuthContext.jsx`: role-aware routing and existing-session admin login/logout.
- `scripts/browser-test-server.mjs`: disposable admin test fixture only.
- `server/test/app.test.js`, `server/test/integration/reports.test.js`: unavailable-service coverage and admin report-denial regression.
- `README.md`, `VERIFICATION.md`: entry points and verification record.

## Verification

Run `npm test`, `npm run test:db`, and `npm run test:ui`. Database and browser suites use explicitly isolated disposable local MongoDB processes; they never connect to Atlas. Browser tests build the production frontend and run headless Chrome, including 390px and desktop layouts. The populated screenshot test mocks display data only; real aggregation/query behavior is verified separately against MongoDB. Results and screenshot paths are recorded in `VERIFICATION.md`.
