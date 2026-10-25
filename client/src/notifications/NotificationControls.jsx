import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { Notice } from '../components/Notice';
import { deviceToken, pushSupported, enableDevicePush, detachLocalPush, reconcileDevicePush, confirmPushDisabled } from './pushClient';
import './notifications.css';

export function NotificationControls() {
  const [config, setConfig] = useState(null), [active, setActive] = useState(false), [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState(() => window.Notification?.permission || 'unsupported');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const supported = pushSupported();
  const iphone = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  async function load() {
    setLoading(true); setError('');
    try {
      const result = await api('/notifications/config'); setConfig(result);
      if (deviceToken() && supported) {
        await reconcileDevicePush();
        const response = await fetch('/api/notifications/subscription', { cache: 'no-store', credentials: 'same-origin', headers: { 'X-Push-Device': deviceToken(), Accept: 'application/json' } });
        const payload = await response.json(); setActive(!!payload.data?.active);
      }
      setPermission(window.Notification?.permission || 'unsupported');
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    load();
    const revisit = () => { if (!pending.current) load(); };
    window.addEventListener('focus', revisit);
    return () => window.removeEventListener('focus', revisit);
  }, []);
  async function enable() {
    if (pending.current || !supported || !config?.configured) return;
    pending.current = true; setBusy(true); setError('');
    // Must occur synchronously in this user click, before any awaited registration/network work.
    try {
      const permissionRequest = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();
      await enableDevicePush(config, permissionRequest); setActive(true);
    }
    catch (failure) { setError(failure.message); setActive(false); }
    finally { setPermission(Notification.permission); setBusy(false); pending.current = false; }
  }
  async function disable() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    await detachLocalPush(); setActive(false);
    try { const token = deviceToken(); if (token) { await api('/notifications/subscription', { method: 'DELETE', body: { deviceToken: token } }); confirmPushDisabled(); } }
    catch (failure) { setError('أُوقف عرض الإشعارات على الجهاز، وتعذّر تأكيد إلغاء الاشتراك على الخادم. أعد المحاولة عند الاتصال. ' + failure.message); }
    finally { setBusy(false); pending.current = false; }
  }
  const permissionLabel = { granted: 'مسموح', denied: 'محظور', default: 'لم يُطلب بعد', unsupported: 'غير مدعوم' }[permission];
  return <div className="push-controls">
    <p>اختر استقبال تنبيهات المجلس عن موعد دور حارتك وبدء الضخ. لا تتضمن التنبيهات بياناتك الشخصية.</p>
    <dl><div><dt>إذن الإشعارات</dt><dd>{permissionLabel}</dd></div><div><dt>اشتراك هذا الجهاز</dt><dd role="status">{loading ? 'جارٍ التحقق…' : active ? 'مفعّل' : 'غير مفعّل'}</dd></div></dl>
    {iphone && !installed && <p className="push-guidance">على iPhone: افتح الموقع في Safari، ثم مشاركة ← إضافة إلى الشاشة الرئيسية. افتح التطبيق من أيقونته ثم اختر تفعيل الإشعارات. يلزم iOS 16.4 أو أحدث.</p>}
    {!supported && <p className="push-guidance">الإشعارات غير مدعومة في هذا المتصفح أو وضع التصفح. استخدم Chrome على Android أو تطبيق الشاشة الرئيسية على iPhone مع نظام مدعوم وHTTPS.</p>}
    {permission === 'denied' && <p className="push-guidance">السماح بالإشعارات محظور. غيّر الإذن من إعدادات المتصفح أو إعدادات إشعارات الجهاز، ثم أعد فتح التطبيق.</p>}
    {config && !config.configured && <p className="push-guidance">خدمة الإشعارات غير مهيأة على الخادم بعد. لم يُطلب إذن الإشعارات.</p>}
    {config?.configured && !config.outboundEnabled && <p className="push-guidance">الإرسال التجريبي متوقف حاليًا. تفعيل الاشتراك لا يعني بدء إرسال تنبيهات.</p>}
    {error && <Notice onRetry={load}>{error}</Notice>}
    <div className="push-actions"><button type="button" onClick={enable} disabled={busy || loading || active || !supported || !config?.configured || permission === 'denied' || (iphone && !installed)}>تفعيل الإشعارات</button><button type="button" onClick={disable} disabled={busy || loading || (!active && !deviceToken())}>إيقاف الإشعارات</button></div>
  </div>;
}
