import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { browserHints } from '../installation/flow';

export const INSTALL_DISMISS_KEY = 'door-pwa-install-dismissed-until';
const PwaContext = createContext(null);
let registrationPromise;
const standaloneDisplay = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const dismissalActive = () => { try { return Number(localStorage.getItem(INSTALL_DISMISS_KEY)) > Date.now(); } catch { return false; } };

function registerWorker() {
  registrationPromise ||= new Promise((resolve, reject) => {
    const register = () => navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(resolve, reject);
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  });
  return registrationPromise;
}

export function PwaProvider({ children }) {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [standalone, setStandalone] = useState(standaloneDisplay);
  const [installEvent, setInstallEvent] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [installationConfirmed, setInstallationConfirmed] = useState(false);
  const deferredInstall = useRef(null);
  const [dismissed, setDismissed] = useState(dismissalActive);
  const [needUpdate, setNeedUpdate] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [updating, setUpdating] = useState(false);
  const registration = useRef(null);
  const acceptedUpdate = useRef(false);
  // Weak references do not retain detached login forms or their password fields.
  const dirtyForms = useRef(new WeakSet());

  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const displayChanged = () => setStandalone(standaloneDisplay());
    const disconnected = () => setOffline(true);
    const beforeInstall = (event) => {
      if (browserHints(navigator).ios || typeof event.prompt !== 'function') return;
      event.preventDefault(); deferredInstall.current = event; setInstallEvent(event);
    };
    // Confirmation does not mean this browser tab is now a standalone window.
    const installed = () => { setInstallationConfirmed(true); deferredInstall.current = null; setInstallEvent(null); };
    const changed = (event) => { const form = event.target.closest?.('form'); if (form) dirtyForms.current.add(form); };
    const reset = (event) => dirtyForms.current.delete(event.target);
    const message = (event) => { if (event.data?.type === 'API_NETWORK_FAILURE') setOffline(true); };
    window.addEventListener('offline', disconnected);
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);
    document.addEventListener('input', changed, true);
    document.addEventListener('change', changed, true);
    document.addEventListener('reset', reset, true);
    media.addEventListener('change', displayChanged);
    navigator.serviceWorker?.addEventListener('message', message);
    return () => {
      window.removeEventListener('offline', disconnected);
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
      document.removeEventListener('input', changed, true);
      document.removeEventListener('change', changed, true);
      document.removeEventListener('reset', reset, true);
      media.removeEventListener('change', displayChanged);
      navigator.serviceWorker?.removeEventListener('message', message);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('is-standalone', standalone);
  }, [standalone]);

  useEffect(() => {
    if (!import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) return;
    let disposed = false, cleanup = () => {};
    let hadController = Boolean(navigator.serviceWorker.controller);
    const controllerChanged = () => {
      if (acceptedUpdate.current) { window.location.reload(); return; }
      if (hadController) setNeedUpdate(true);
      hadController = true;
    };
    navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
    registerWorker().then((workerRegistration) => {
      if (disposed) return;
      registration.current = workerRegistration;
      if (workerRegistration.waiting && navigator.serviceWorker.controller) setNeedUpdate(true);
      const observe = () => {
        const worker = workerRegistration.installing;
        const stateChanged = () => {
          if (!disposed && worker.state === 'installed' && navigator.serviceWorker.controller) setNeedUpdate(true);
        };
        worker?.addEventListener('statechange', stateChanged);
      };
      let checkedAt = Date.now();
      const revisit = () => {
        if (document.visibilityState === 'visible' && navigator.onLine && Date.now() - checkedAt > 60000) {
          checkedAt = Date.now();
          workerRegistration.update().catch(() => {});
        }
      };
      workerRegistration.addEventListener('updatefound', observe);
      if (workerRegistration.installing) observe();
      window.addEventListener('focus', revisit);
      document.addEventListener('visibilitychange', revisit);
      cleanup = () => {
        workerRegistration.removeEventListener('updatefound', observe);
        window.removeEventListener('focus', revisit);
        document.removeEventListener('visibilitychange', revisit);
      };
    }).catch(() => { /* Installation failure must not interrupt the online application. */ });
    return () => { disposed = true; cleanup(); navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged); };
  }, []);

  const dismissInstall = () => {
    setDismissed(true);
    try { localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now() + 30 * 86400000)); } catch {}
  };
  const install = async () => {
    const event = deferredInstall.current;
    if (!event || standalone || browserHints(navigator).ios) return 'unavailable';
    deferredInstall.current = null;
    setInstallEvent(null); setInstalling(true);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === 'dismissed') dismissInstall();
      else setDismissed(true);
      return choice.outcome;
    } finally { setInstalling(false); }
  };
  const update = async () => {
    if (updating) return;
    const unsaved = [...document.forms].some((form) => dirtyForms.current.has(form));
    if (unsaved && !window.confirm('هناك بيانات في نموذج لم تغادره بعد. سيؤدي التحديث إلى إعادة فتح التطبيق وفقدان البيانات غير المحفوظة. هل تريد التحديث الآن؟')) return;
    setUpdateError('');
    if (!navigator.onLine) { setUpdateError('يرجى الاتصال بالإنترنت ثم إعادة المحاولة.'); return; }
    setUpdating(true);
    acceptedUpdate.current = true;
    const waiting = registration.current?.waiting;
    if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
    else window.location.reload();
  };
  return <PwaContext.Provider value={{ offline, standalone, installEvent, installing, installationConfirmed, dismissed, dismissInstall, install, needUpdate, update, updating, updateError }}>{children}</PwaContext.Provider>;
}

export const usePwa = () => useContext(PwaContext);
