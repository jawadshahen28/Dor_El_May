import { pushMessage, safeNotificationUrl } from '@door-el-may/shared/push';

// This separate bounded store holds only an opaque device binding and expiring event IDs.
// No API response, account, endpoint, encryption key or notification body is stored here.
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('door-push-v1', 1);
    request.onupgradeneeded = () => { const db = request.result; db.createObjectStore('meta'); const seen = db.createObjectStore('seen', { keyPath: 'id' }); seen.createIndex('expiresAt', 'expiresAt'); };
    request.onerror = () => reject(new Error('Push storage unavailable.')); request.onsuccess = () => resolve(request.result);
  });
}
async function read(store, key) {
  const db = await database();
  try { return await new Promise((resolve, reject) => { const request = db.transaction(store).objectStore(store).get(key); request.onsuccess = () => resolve(request.result); request.onerror = reject; }); }
  finally { db.close(); }
}
async function write(operation) {
  const db = await database();
  try { await new Promise((resolve, reject) => { const transaction = db.transaction(['meta', 'seen'], 'readwrite'); operation(transaction); transaction.oncomplete = resolve; transaction.onerror = reject; transaction.onabort = reject; }); }
  finally { db.close(); }
}
async function binding(value) {
  await write((transaction) => { transaction.objectStore('meta').put(value, 'binding'); if (!value) transaction.objectStore('seen').clear(); });
}
async function remember(id, expiresAt) {
  await write((transaction) => {
    const store = transaction.objectStore('seen'); store.put({ id, expiresAt });
    const request = store.index('expiresAt').openCursor(null, 'prev'); let kept = 0;
    request.onsuccess = () => { const cursor = request.result; if (!cursor) return; if (cursor.value.expiresAt <= Date.now() || ++kept > 256) cursor.delete(); cursor.continue(); };
  });
}
export function setupWorkerPush(worker) {
  let chain = Promise.resolve();
  const serialize = (operation) => { chain = chain.catch(() => {}).then(operation); return chain; };
  worker.addEventListener('message', (event) => {
    if (!['PUSH_STATUS', 'PUSH_BIND', 'PUSH_CLEAR'].includes(event.data?.type)) return;
    if (!event.source?.url || new URL(event.source.url).origin !== worker.location.origin) return;
    event.waitUntil(serialize(async () => {
      try {
        if (event.data.type === 'PUSH_BIND') {
          if (!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/.test(event.data.binding || '')) throw new Error('Invalid binding.');
          await binding(event.data.binding);
        } else if (event.data.type === 'PUSH_CLEAR') {
          await binding(null); for (const notification of await worker.registration.getNotifications()) notification.close();
        }
        event.ports[0]?.postMessage({ ok: true, protocol: 1 });
      } catch { event.ports[0]?.postMessage({ ok: false }); }
    }));
  });
  worker.addEventListener('push', (event) => event.waitUntil(serialize(async () => {
    try {
      const raw = event.data?.text(); if (!raw || raw.length > 2048) return;
      const payload = JSON.parse(raw), message = pushMessage(payload);
      if (!message || await read('meta', 'binding') !== payload.binding) return;
      const id = payload.binding + ':' + payload.eventId;
      if ((await read('seen', id))?.expiresAt > Date.now()) return;
      await worker.registration.showNotification(message.title, { body: message.body, lang: 'ar', dir: 'rtl', icon: '/icons/pwa-192.png',
        tag: payload.eventId, renotify: false, data: { url: message.url } });
      await remember(id, payload.expiresAt);
    } catch { /* Invalid data, blocked permission or unavailable storage fails closed without displaying private content. */ }
  })));
  worker.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil((async () => {
      const url = safeNotificationUrl(event.notification.data?.url, worker.location.origin);
      const clients = await worker.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = clients.find((client) => client.url === url);
      if (existing) await existing.focus();
      else await worker.clients.openWindow(url);
      // The ordinary React routes and server session checks handle expired/changed accounts.
    })());
  });
  worker.addEventListener('pushsubscriptionchange', (event) => event.waitUntil(serialize(async () => {
    await binding(null);
    for (const client of await worker.clients.matchAll({ type: 'window' })) client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' });
    // Reconcile only on an authenticated revisit. Never put a session token in this worker.
  })));
}
