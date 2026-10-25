# Persistent citizen notification inbox

The bell opens `/notifications`, a protected Arabic RTL inbox with unread counts, event icons, date groups, read/read-all controls and cursor pagination. Device alerts reuse the existing opt-in flow. Declining browser permission never blocks the inbox; permission is requested only from an explicit enable click. The outdated experimental sending message is removed.

## Storage and official events

`CitizenNotification` is the only new collection. Each document stores its citizen owner, existing durable event key, type, neighborhood-name/scheduled-date snapshot, actual event instant and nullable `readAt`. A unique `(userId, eventKey)` index prevents duplicates; owner/time/id and owner/read indexes support list/count queries. There is **no TTL or automatic deletion**. History survives logout, expired push deliveries and different devices.

Only new first publication and pumping-start transitions receive an `inbox.version: 1` marker within `WaterRound.notificationEvents`. The original push key/type/zone/time remain unchanged. The marker contains the actual database neighborhood name, scheduled-date snapshot and resumable fan-out cursor/completion flag. It commits in the same single-document conditional update as the official transition, not a separate event producer.

After the transition, bounded fan-out inserts one row per eligible active resident in that neighborhood, including residents without push subscriptions. Accounts registered after the event are excluded. Role/status/neighborhood are checked during fan-out. Drafts, edits, cancellation and completion emit no inbox events. Saved snapshots retain the original context after later schedule/name changes. Historical entries describe an announced event, not guaranteed current pumping state.

A crash/failure leaves the durable cursor incomplete. The existing enabled Render push command repairs pending inbox work **after** unchanged push processing; opening the inbox also repairs bounded pending work for the citizen's neighborhood. Conditional cursor advances and unique upserts support concurrent recovery without resetting `readAt`. Cursor writes do not alter the round's official revision or `updatedAt`. Large backlogs can require multiple existing Cron runs/refreshes.

Legacy experimental intents lack this marker and are never backfilled automatically. No migration, account copying, reseeding or ledger reset is required. Inbox persistence imports no push transport and does not create/requeue `PushEvent` or `PushDelivery` records.

## API and privacy

All paths require the existing authenticated active resident session. Every query/write derives ownership from that session. Administrators and guests cannot access citizen inboxes. Mutations retain CSRF, exact Origin, JSON-size and general rate-limit protections.

| Method and path | Contract |
| --- | --- |
| `GET /api/notifications/inbox` | Latest 20 items, unread count, server reference instant and optional `nextCursor`. Only optional validated `before` cursor is accepted. |
| `GET /api/notifications/unread-count` | Current account's unread count; no query parameters. |
| `POST /api/notifications/inbox/:id/read` | Empty JSON body. Marks an owned item once; missing/other-account IDs share a 404. Returns the item/current count. |
| `POST /api/notifications/read-all` | Empty JSON body. Marks the current account's existing unread rows, leaving later-created rows unread. |

Responses expose only item ID/type/title/body, safe destination, scheduled date, event instant and `readAt`. No owner/zone IDs, source keys, endpoints, encryption/session material or other citizens' data are returned. All APIs remain `no-store` and excluded from worker caches. Inbox data is not stored in localStorage or CacheStorage.

The UI refreshes on entry, throttled visible focus/revisit and once a minute while visible. Read actions update the bell badge immediately; stale count replies cannot undo them, and account changes hide old badges. Lists have loading/empty/error/retry states; failed refreshes never invent a zero. Notification links mark the item read before ordinary navigation, while modified/new-tab links preserve browser behavior.

Schedule copy uses the stored neighborhood/date and current server reference date in `Asia/Hebron`: `غدًا` appears only for the next Palestine calendar day. Other entries show their actual scheduled date. Event timestamps/date groups also use Palestine time, independent of device timezone.

## Deployment and verification

No new environment variables, keys, services, Cron schedule or build/start commands are required. Keep Render/MongoDB/VAPID settings unchanged. Web startup initializes the collection/indexes. The existing `npm run push:process` performs its original delivery work, then bounded inbox repair. It is never run by build/web startup; its disabled path still does not connect to MongoDB.

After the Web Service and existing Cron use this commit, new publication/start events populate the inbox. Older pushes/test rounds intentionally do not suddenly appear. Accept the normal PWA update on an installed device. Verify `/notifications` refreshes, unauthorized inbox APIs return JSON 401, and worker/manifest still load. Real-device checks require separately authorized council actions; none is triggered by implementation.

Run `npm test`, `npm run test:db`, `npm run test:production`, `npm run test:ui`. Tests use disposable local MongoDB, ephemeral keys and mock/synthetic push only. Browser tests cover permission-denied inbox access, real council event persistence, badge/read/navigation updates, error recovery and mobile/desktop screenshots. Existing subscription/worker tests remain. Physical provider delivery is not inferred from automated tests.
