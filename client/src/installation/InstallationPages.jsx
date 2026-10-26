import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, ChevronRight, Chrome, Copy, Download, ExternalLink } from 'lucide-react';
import { usePwa } from '../pwa/PwaProvider';
import { browserHints, CHROME_SETUP_INTENT, SETUP_URL } from './flow';
import './installation.css';

function InstallationFrame({ children, setup = false }) {
  return <main className={`installation-screen${setup ? ' installation-screen--setup' : ''}`} dir="rtl">
    <img className="installation-village" src="/images/talfit-village.jpg" alt="إطلالة على قرية تلفيت" fetchPriority="high" />
    <div className="installation-shade" />
    <div className="installation-frame">
      <header className="installation-brand">
        <img src="/images/talfit-council-logo.jpg" width="112" height="112" alt="شعار مجلس قروي تلفيت الرسمي" />
      </header>
      <section className="installation-hero" aria-labelledby="installation-title">
        <img className="installation-water-mark" src="/images/water-mark.svg" width="94" height="116" alt="شعار دور المي" />
        <h1 id="installation-title">دور المي – تلفيت</h1>
        {children}
      </section>
    </div>
  </main>;
}

function CopySetupLink() {
  const [state, setState] = useState('');
  const [busy, setBusy] = useState(false);
  const field = useRef(null);
  useEffect(() => { if (state === 'manual') { field.current?.focus(); field.current?.select(); } }, [state]);
  async function copy() {
    setBusy(true);
    try { await navigator.clipboard.writeText(SETUP_URL); setState('copied'); }
    catch { setState('manual'); field.current?.focus(); field.current?.select(); }
    finally { setBusy(false); }
  }
  return <div className="installation-copy">
    <button type="button" onClick={copy} disabled={busy}><Copy size={16} aria-hidden="true" />{busy ? 'جارٍ النسخ…' : 'نسخ الرابط'}</button>
    <p role="status">{state === 'copied' ? 'تم نسخ رابط التثبيت.' : state === 'manual' ? 'تعذّر النسخ التلقائي. اضغط على الرابط المحدد مطولًا أو استخدم أمر النسخ في جهازك.' : ''}</p>
    {state === 'manual' && <input ref={field} type="url" dir="ltr" value={SETUP_URL} readOnly aria-label="رابط التثبيت للنسخ اليدوي" onFocus={event => event.target.select()} />}
  </div>;
}

export function DownloadPage() {
  const hints = browserHints(navigator);
  const { installEvent } = usePwa();
  const needsChrome = hints.android && (hints.embedded || (!hints.chrome && !installEvent));
  return <InstallationFrame>
    <p className="installation-lead">خدمة من مجلس قروي تلفيت لمتابعة دور المياه واستقبال إشعارات الضخ في الحارة.</p>
    <div className="installation-gateway-actions">
      {needsChrome
        ? <a className="installation-cta" href={CHROME_SETUP_INTENT}><Chrome size={29} aria-hidden="true" /><span dir="rtl">الانتقال إلى تثبيت التطبيق</span><ChevronRight size={25} aria-hidden="true" /></a>
        : <Link className="installation-cta" to="/setup"><Chrome size={29} aria-hidden="true" /><span dir="rtl">الانتقال إلى تثبيت التطبيق</span><ChevronRight size={25} aria-hidden="true" /></Link>}
      <p className="installation-action-note">سيتم فتح المتصفح لإكمال تثبيت التطبيق</p>
      {hints.ios && <p className="installation-ios-note">على الآيفون والآيباد، افتح رابط التثبيت في Safari. إذا كنت داخل تطبيق آخر، انسخ الرابط وافتحه في Safari بنفسك.</p>}
      <div className="installation-recovery"><CopySetupLink />
      <details className="installation-fallback">
        <summary>تعذّر فتح المتصفح؟</summary>
        <p>افتح قائمة التطبيق الذي يعرض الرابط واختر «فتح في المتصفح» أو خيارًا مشابهًا؛ تختلف التسمية حسب التطبيق. إذا لم يفتح المتصفح، انسخ رابط التثبيت وافتحه يدويًا في {hints.ios ? 'Safari' : 'Chrome'}. قد يمنع التطبيق الحالي فتح متصفح خارجي.</p>
      </details></div>
    </div>
  </InstallationFrame>;
}

function ManualSetup({ hints }) {
  const steps = hints.ios ? [
    'افتح رابط التثبيت في Safari.',
    'اضغط «مشاركة». في بعض الواجهات، افتح «قائمة الصفحة» أولًا ثم «مشاركة».',
    'اختر «إضافة إلى الشاشة الرئيسية». إذا لم يظهر الخيار، ابحث عنه ضمن «تعديل الإجراءات».',
    'فعّل «فتح كتطبيق ويب» إذا ظهر، ثم اضغط «إضافة».',
    'افتح دور المي من أيقونته على الشاشة الرئيسية.',
  ] : [
    'افتح رابط التثبيت في Chrome أو متصفح يدعم تثبيت التطبيقات.',
    'افتح قائمة المتصفح ⋮ واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».',
    'أكّد التثبيت، ثم افتح دور المي من أيقونته على جهازك.',
  ];
  return <div className="installation-manual">
    <h2>{hints.ios ? 'التثبيت على الآيفون والآيباد' : 'التثبيت من قائمة المتصفح'}</h2>
    <ol aria-label="خطوات تثبيت دور المي">{steps.map(step => <li key={step}>{step}</li>)}</ol>
    {!hints.ios && <p>قد لا تظهر نافذة التثبيت حسب شروط المتصفح وإعدادات جهازك. اتبع الخطوات أعلاه، أو افتح الرابط في متصفح آخر يدعم التثبيت.</p>}
    {hints.android && hints.embedded && <a className="installation-browser-link" href={CHROME_SETUP_INTENT}>فتح في Chrome<ExternalLink size={16} aria-hidden="true" /></a>}
  </div>;
}

export function SetupPage() {
  const hints = browserHints(navigator);
  const { installEvent, install, installing, installationConfirmed } = usePwa();
  const [feedback, setFeedback] = useState('');
  const canPrompt = Boolean(installEvent) && !hints.ios;
  async function installClicked() {
    setFeedback('');
    try {
      const result = await install();
      setFeedback(result === 'dismissed' ? 'أُغلقت نافذة التثبيت. يمكنك التثبيت لاحقًا من قائمة المتصفح.'
        : result === 'accepted' ? 'تم قبول الطلب في المتصفح. انتظر تأكيده وظهور أيقونة التطبيق.' : 'نافذة التثبيت غير متاحة الآن. اتبع خطوات المتصفح أدناه.');
    } catch { setFeedback('تعذّر فتح نافذة التثبيت. اتبع خطوات التثبيت من قائمة المتصفح أدناه.'); }
  }
  return <InstallationFrame setup>
    <p className="installation-lead">ثبّت التطبيق لتصلك أدوار المياه وإشعارات الضخ بسهولة.</p>
    <div className="installation-glass">
      {installationConfirmed ? <div className="installation-confirmation" role="status">
        <CheckCircle2 size={38} aria-hidden="true" /><h2>افتح دور المي من شاشتك الرئيسية</h2>
        <p>أكّد المتصفح طلب التثبيت. قد يستغرق ظهور الأيقونة بضع لحظات. افتح التطبيق منها لمتابعة دور المياه.</p>
      </div> : <>
        {canPrompt || installing ? <>
          <button className="installation-cta" type="button" onClick={installClicked} disabled={installing}>{hints.chrome ? <Chrome size={29} aria-hidden="true" /> : <Download size={27} aria-hidden="true" />}<span dir="rtl">{installing ? 'اتبع نافذة المتصفح…' : 'تثبيت التطبيق'}</span><ChevronRight size={25} aria-hidden="true" /></button>
          <p className="installation-action-note">بعد التثبيت ستتمكن من متابعة الدور واستقبال الإشعارات.</p>
        </> : <ManualSetup hints={hints} />}
        {feedback && <p className="installation-feedback" role="status">{feedback}</p>}
        {!canPrompt && !installing && <p className="installation-open-note">بعد التثبيت، افتح دور المي من أيقونته على الشاشة الرئيسية.</p>}
      </>}
    </div>
    {!installationConfirmed && <CopySetupLink />}
  </InstallationFrame>;
}
