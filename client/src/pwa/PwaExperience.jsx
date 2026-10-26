import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { Download, RefreshCw, Share, X } from 'lucide-react';
import { usePwa } from './PwaProvider';
import { installationHints } from './installation';
import './offline.css';
import './pwa.css';

export function NetworkBoundary({ children }) {
  const { offline } = usePwa();
  return <>
    <div hidden={offline} inert={offline ? true : undefined}>{children}</div>
    {offline && <main className="pwa-offline" aria-labelledby="network-offline-title">
      <img src="/icons/pwa-192.png" width="84" height="84" alt="دور المي" />
      <span className="pwa-offline-brand">دور المي · مجلس قروي تلفيت</span>
      <h1 id="network-offline-title">لا يوجد اتصال بالإنترنت</h1>
      <p>يرجى الاتصال بالإنترنت للحصول على أحدث معلومات ضخ المياه.</p>
      <button type="button" onClick={() => window.location.reload()}>إعادة المحاولة</button>
    </main>}
  </>;
}

export function PwaNotices() {
  const { pathname } = useLocation();
  const { standalone, installationConfirmed, installEvent, dismissed, dismissInstall, install, needUpdate, update, updating, updateError } = usePwa();
  const [manualReady, setManualReady] = useState(false);
  const [installError, setInstallError] = useState('');
  const dialog = useRef(null);
  const { ios, android } = installationHints(navigator);
  const mobile = ios || android;
  useEffect(() => { const timer = setTimeout(() => setManualReady(true), 8000); return () => clearTimeout(timer); }, []);
  const eligible = !/^\/install\/?$/i.test(pathname) && !pathname.startsWith('/admin') && !standalone && !installationConfirmed && !dismissed && (installEvent || (mobile && manualReady));
  async function installClicked() {
    if (!installEvent) { dialog.current.showModal(); return; }
    try { await install(); } catch { setInstallError('تعذّر فتح نافذة التثبيت. يمكنك استخدام قائمة المتصفح لإضافة التطبيق.'); }
  }
  return <>
    {needUpdate ? <aside className="pwa-notice" aria-label="تحديث تطبيق دور المي">
      <RefreshCw size={22} aria-hidden="true" /><div><p>يتوفر تحديث جديد لتطبيق دور المي</p>{updateError && <small role="alert">{updateError}</small>}<button type="button" onClick={update} disabled={updating}>{updating ? 'جارٍ التحديث…' : 'تحديث الآن'}</button></div>
    </aside> : eligible ? <aside className="pwa-notice" aria-label="تثبيت دور المي">
      <Download size={22} aria-hidden="true" /><div><p>ثبّت تطبيق دور المي على هاتفك</p>{installError && <small role="alert">{installError}</small>}<button type="button" onClick={installClicked}>{installEvent ? 'تثبيت التطبيق' : 'خطوات التثبيت'}</button></div>
      <button className="pwa-notice-close" type="button" aria-label="إخفاء اقتراح التثبيت" onClick={dismissInstall}><X size={19} /></button>
    </aside> : null}
    <dialog className="pwa-install-dialog" ref={dialog} aria-labelledby="pwa-install-title" onClick={(event) => { if (event.target === event.currentTarget) dialog.current.close(); }}>
      <button className="pwa-dialog-close" type="button" aria-label="إغلاق تعليمات التثبيت" onClick={() => dialog.current.close()}><X size={22} /></button>
      <img src="/icons/pwa-192.png" width="62" height="62" alt="دور المي" />
      <h2 id="pwa-install-title">تثبيت دور المي {ios ? 'على iPhone' : 'على الهاتف'}</h2>
      {ios ? <p><Share size={18} aria-hidden="true" />افتح الموقع في Safari، واضغط «مشاركة»، ثم «إضافة إلى الشاشة الرئيسية» و«إضافة». إذا ظهر خيار «فتح كتطبيق ويب»، أبقِه مفعّلًا.</p>
        : <p>افتح قائمة المتصفح، ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية» وأكّد التثبيت.</p>}
      <button className="pwa-manual-done" type="button" onClick={() => { dialog.current.close(); dismissInstall(); }}>حسنًا</button>
    </dialog>
  </>;
}
