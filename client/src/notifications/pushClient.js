import { api } from '../services/api';

const DEVICE_KEY = 'door-push-device';
const DISABLED_KEY = 'door-push-disabled';
const REVISION_KEY = 'door-push-revision';
const revision = () => localStorage.getItem(REVISION_KEY);
let changing = false, generation = 0, synchronization = null;
export function confirmPushDisabled() { try { localStorage.setItem(DISABLED_KEY, 'confirmed'); } catch {} }
export function pushSupported() { return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
export function deviceToken(create = false) {
  try {
    let value = localStorage.getItem(DEVICE_KEY);
    if (!/^[a-f\d]{64}$/.test(value || '')) value = null;
    if (!value && create) { value = [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => byte.toString(16).padStart(2, '0')).join(''); localStorage.setItem(DEVICE_KEY, value); }
    return value;
  } catch { return null; }
}
export async function workerCommand(type, binding) {
  const registration = await navigator.serviceWorker?.getRegistration('/');
  const worker = registration?.active;
  if (!worker) throw new Error('حدّث التطبيق وانتظر اكتمال تشغيله، ثم أعد المحاولة.');
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error('تحتاج نسخة التطبيق إلى تحديث لدعم الإشعارات.')); }, 3000);
    channel.port1.onmessage = (event) => { clearTimeout(timer); channel.port1.close(); event.data?.ok ? resolve(event.data) : reject(new Error('تعذّر تهيئة إشعارات الجهاز.')); };
    worker.postMessage({ type, binding }, [channel.port2]);
  });
}
export async function detachLocalPush() {
  if (!deviceToken() || !navigator.serviceWorker) return;
  generation++;
  try { localStorage.setItem(REVISION_KEY, crypto.randomUUID()); if (localStorage.getItem(DISABLED_KEY) !== 'confirmed') localStorage.setItem(DISABLED_KEY, 'pending'); } catch {}
  // Clear the local binding before contacting the network, including offline logout attempts.
  await workerCommand('PUSH_CLEAR').catch(() => {});
  let timer;
  try {
    await Promise.race([
      (async () => { const registration = await navigator.serviceWorker.getRegistration('/'); const subscription = await registration?.pushManager?.getSubscription(); await subscription?.unsubscribe(); })().catch(() => {}),
      new Promise((resolve) => { timer = setTimeout(resolve, 2000); }),
    ]);
  } finally { clearTimeout(timer); }
}
export function reconcileDevicePush() {
  if (synchronization) return synchronization;
  synchronization = reconcile().finally(() => { synchronization = null; });
  return synchronization;
}
async function reconcile() {
  const token = deviceToken();
  if (!token || !pushSupported() || changing || !navigator.onLine) return;
  if (localStorage.getItem(DISABLED_KEY) === 'confirmed') return;
  const startedGeneration = generation;
  const startedRevision = revision();
  if (localStorage.getItem(DISABLED_KEY)) {
    await detachLocalPush();
    if (changing) return;
    await api('/notifications/subscription', { method: 'DELETE', body: { deviceToken: token } });
    if (!changing) confirmPushDisabled();
    return;
  }
  const registration = await navigator.serviceWorker.getRegistration('/');
  const browserSubscription = await registration?.pushManager?.getSubscription();
  const response = await fetch('/api/notifications/subscription', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', 'X-Push-Device': token } });
  const result = await response.json();
  if (changing || generation !== startedGeneration || revision() !== startedRevision || localStorage.getItem(DISABLED_KEY)) return;
  if (result.success && result.data.active && browserSubscription && Notification.permission === 'granted') {
    await workerCommand('PUSH_BIND', result.data.binding);
    if (generation !== startedGeneration || revision() !== startedRevision || localStorage.getItem(DISABLED_KEY)) await detachLocalPush();
  } else {
    await detachLocalPush();
    if (response.ok) { await api('/notifications/subscription', { method: 'DELETE', body: { deviceToken: token } }); if (!changing) confirmPushDisabled(); }
  }
}
export async function enableDevicePush(config, permissionPromise) {
  changing = true;
  try {
  const permission = await permissionPromise;
  if (permission !== 'granted') throw new Error('لم يُسمح بالإشعارات. يمكنك تغيير الإذن من إعدادات المتصفح أو الجهاز.');
  await synchronization?.catch(() => {});
  const startedGeneration = generation;
  const startedRevision = revision();
  await workerCommand('PUSH_STATUS');
  const registration = await navigator.serviceWorker.getRegistration('/');
  let subscription = await registration.pushManager.getSubscription();
  const publicKey = Uint8Array.from(atob(config.publicKey.replaceAll('-', '+').replaceAll('_', '/')), (character) => character.charCodeAt(0));
  if (subscription && subscription.options?.applicationServerKey && [...new Uint8Array(subscription.options.applicationServerKey)].join() !== [...publicKey].join()) { await subscription.unsubscribe(); subscription = null; }
  subscription ||= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
  const token = deviceToken(true);
  if (!token) { await subscription.unsubscribe(); throw new Error('اسمح بتخزين تفضيل الجهاز في هذا المتصفح ثم أعد المحاولة.'); }
  try {
    const result = await api('/notifications/subscription', { method: 'POST', body: { deviceToken: token, subscription: subscription.toJSON() } });
    if (generation !== startedGeneration || revision() !== startedRevision) throw new Error('تغيّرت جلسة الجهاز. أعد تفعيل الإشعارات من حسابك الحالي.');
    await workerCommand('PUSH_BIND', result.binding);
    if (generation !== startedGeneration || revision() !== startedRevision) throw new Error('تغيّرت جلسة الجهاز. أعد تفعيل الإشعارات من حسابك الحالي.');
    localStorage.removeItem(DISABLED_KEY);
    return result;
  } catch (error) {
    await detachLocalPush();
    await api('/notifications/subscription', { method: 'DELETE', body: { deviceToken: token } }).then(confirmPushDisabled).catch(() => {});
    throw error;
  }
  } finally { changing = false; }
}
