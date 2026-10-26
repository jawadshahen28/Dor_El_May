import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, Bell, CalendarDays, Check, CheckCircle2, Copy, Download, ExternalLink, Megaphone, Share, Smartphone } from 'lucide-react';
import { CouncilSignature } from '../components/Brand';
import { usePwa } from '../pwa/PwaProvider';
import { ANDROID_CHROME_INTENT, INSTALL_URL, copyInstallationLink, installationHints } from '../pwa/installation';
import './install.css';

function InstallationSteps({ ios, android }) {
  const steps = ios ? [
    ['افتح الرابط في Safari.', 'استخدم متصفح Safari على الآيفون أو الآيباد.'],
    ['اضغط زر المشاركة.', 'في بعض الواجهات، افتح «قائمة الصفحة» أولًا، ثم اختر «مشاركة».'],
    ['اختر إضافة إلى الشاشة الرئيسية.', 'إذا لم يظهر الخيار، ابحث عنه ضمن «تعديل الإجراءات» في قائمة المشاركة.'],
    ['فعّل فتح كتطبيق ويب إذا ظهر الخيار.', 'ليفتح دور المي كتطبيق من الشاشة الرئيسية.'],
    ['اضغط إضافة.', 'بعد الإضافة، افتح دور المي من رمزه على الشاشة الرئيسية.'],
  ] : [
    [android ? 'افتح الرابط في Chrome.' : 'افتح الرابط في متصفح يدعم التثبيت.', android ? 'إذا كنت داخل تطبيق آخر، استخدم إرشادات فتح المتصفح أدناه.' : 'يمكنك استخدام Chrome أو Edge، أو اتباع قائمة متصفحك.'],
    ['افتح قائمة المتصفح.', 'اضغط قائمة ⋮ أو زر القائمة بجوار شريط العنوان.'],
    ['اختر تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية.', 'قد يظهر خيار التثبيت أيضًا بجوار شريط العنوان.'],
    ['أكّد التثبيت من المتصفح.', 'ثم افتح دور المي من الرمز الذي يضيفه جهازك.'],
  ];
  return <ol className="install-steps" id="installation-steps" role="list" aria-label="خطوات تثبيت التطبيق">
    {steps.map(([title, description], index) => <li key={title}>
      <span className="install-step-number" aria-hidden="true">{index + 1}</span>
      <div><h3>{title}{ios && index === 1 && <Share size={17} aria-hidden="true" />}</h3><p>{description}</p></div>
    </li>)}
  </ol>;
}

export function InstallPage() {
  const { standalone, installationConfirmed, installEvent, installing, install } = usePwa();
  const [hints] = useState(() => installationHints(navigator));
  const [installFeedback, setInstallFeedback] = useState('');
  const [copyState, setCopyState] = useState('');
  const [copying, setCopying] = useState(false);
  const [externalAttempted, setExternalAttempted] = useState(false);
  const manualLink = useRef(null);
  const canPrompt = Boolean(installEvent) && !hints.ios;
  const complete = standalone || installationConfirmed;

  useEffect(() => {
    if (copyState === 'manual') { manualLink.current?.focus(); manualLink.current?.select(); }
  }, [copyState]);

  async function installClicked() {
    setInstallFeedback('');
    try {
      const outcome = await install();
      setInstallFeedback(outcome === 'dismissed'
        ? 'أُغلقت نافذة التثبيت. يمكنك متابعة استخدام الموقع والتثبيت لاحقًا من قائمة المتصفح.'
        : outcome === 'accepted' ? 'تم قبول طلبك في المتصفح. انتظر تأكيده، ثم افتح التطبيق من شاشتك الرئيسية.'
          : 'نافذة التثبيت غير متاحة الآن. اتبع خطوات متصفحك أدناه.');
    } catch { setInstallFeedback('تعذّر فتح نافذة التثبيت. يمكنك استخدام قائمة المتصفح واتباع الخطوات أدناه.'); }
  }

  async function copyClicked() {
    setCopying(true);
    const copied = await copyInstallationLink();
    setCopyState(copied ? 'copied' : 'manual');
    setCopying(false);
    if (!copied) { manualLink.current?.focus(); manualLink.current?.select(); }
  }

  return <div className="install-page" dir="rtl">
    <a className="install-skip" href="#install-main">الانتقال إلى المحتوى</a>
    <header className="install-topbar">
      <Link to="/" className="install-wordmark" aria-label="دور المي — الدخول إلى التطبيق">
        <img src="/images/water-mark.svg" width="32" height="40" alt="" />
        <span>دور المي<small>تلفيت</small></span>
      </Link>
      <span className="install-official">الخدمات الإلكترونية<br /><strong>مجلس قروي تلفيت</strong></span>
    </header>

    <main className={`install-layout${complete ? ' install-layout--complete' : ''}`} id="install-main">
      <section className="install-intro" aria-labelledby="install-title">
        <span className="install-eyebrow"><span aria-hidden="true" />من أهل البلد، لأهل البلد</span>
        <img className="install-app-icon" src="/icons/pwa-192.png" width="94" height="94" alt="أيقونة دور المي" />
        <h1 id="install-title">{complete ? 'دور المي معك، أينما كنت' : 'ثبّت تطبيق دور المي'}</h1>
        <p className="install-lead">تابع دور المياه في حارتك واستقبل تنبيهات بدء الضخ أولًا بأول.</p>
      </section>
      <section className="install-service-details" aria-label="خدمة المياه من مجلس قروي تلفيت">
        <ul className="install-benefits" aria-label="مزايا دور المي">
          <li><span><CalendarDays size={21} aria-hidden="true" /></span>معرفة موعد دور المياه.</li>
          <li><span><Bell size={21} aria-hidden="true" /></span>استقبال إشعارات بدء الضخ.</li>
          <li><span><Megaphone size={21} aria-hidden="true" /></span>متابعة إعلانات مجلس قروي تلفيت.</li>
        </ul>
        <div className="install-council"><CouncilSignature /></div>
      </section>

      <section className="install-card" aria-labelledby="install-guide-title">
        <div className="install-card-symbol" aria-hidden="true">{complete ? <CheckCircle2 size={28} /> : hints.ios ? <Share size={27} /> : <Smartphone size={28} />}</div>
        {complete ? <>
          <span className="install-chip"><Check size={14} aria-hidden="true" />{standalone ? 'داخل التطبيق' : 'تأكيد من المتصفح'}</span>
          <h2 id="install-guide-title">{standalone ? 'أهلًا بك في دور المي' : 'تم تأكيد طلب التثبيت'}</h2>
          <p className="install-card-intro">{standalone ? 'أنت تستخدم دور المي من نافذة التطبيق. تابع إلى حسابك لمعرفة آخر أخبار المياه.' : 'أكّد المتصفح طلب التثبيت. قد يستغرق ظهور الرمز على جهازك بضع لحظات؛ يمكنك متابعة استخدام الموقع الآن.'}</p>
          <Link to="/" className="install-button install-button--primary">فتح التطبيق<ArrowLeft size={19} aria-hidden="true" /></Link>
        </> : <>
          <span className="install-chip">{canPrompt ? 'التثبيت متاح في متصفحك' : hints.ios ? 'دليل الآيفون والآيباد' : hints.android ? 'دليل Android' : 'على هاتفك أو حاسوبك'}</span>
          <h2 id="install-guide-title">{canPrompt ? 'دور المي على شاشتك الرئيسية' : hints.ios ? 'تثبيت دور المي على الآيفون' : hints.android ? 'تثبيت دور المي على Android' : 'أضف دور المي إلى جهازك'}</h2>
          <p className="install-card-intro">{hints.ios ? 'أضف التطبيق إلى الشاشة الرئيسية واستقبل تنبيهات المياه.' : 'وصول أسرع إلى خدمة المياه، مباشرة من شاشتك الرئيسية.'}</p>

          {canPrompt || installing ? <>
            <button className="install-button install-button--primary" type="button" onClick={installClicked} disabled={installing}>
              <Download size={21} aria-hidden="true" />{installing ? 'اتبع نافذة المتصفح…' : 'تثبيت التطبيق'}
            </button>
            <p className="install-small">ستظهر نافذة المتصفح لتأكيد التثبيت. يبدأ التثبيت فقط عند موافقتك.</p>
          </> : <>
            {hints.embedded && <p className="install-browser-note">{hints.ios ? 'إذا فُتح الرابط داخل تطبيق آخر، افتحه في Safari لإضافته إلى الشاشة الرئيسية.' : 'لتثبيت دور المي، افتح هذا الرابط في Chrome.'}</p>}
            {hints.android && hints.embedded && !externalAttempted
              ? <a className="install-button install-button--primary" href={ANDROID_CHROME_INTENT} onClick={() => setExternalAttempted(true)}>فتح في Chrome<ExternalLink size={19} aria-hidden="true" /></a>
              : <a href="#installation-steps" className="install-button install-button--primary">{hints.ios ? 'خطوات التثبيت في Safari' : 'عرض خطوات التثبيت'}<ArrowLeft size={19} aria-hidden="true" /></a>}
          </>}
          {installFeedback && <p className="install-feedback" role="status">{installFeedback}</p>}

          {!canPrompt && !installing && <>
            <details className="install-browser-help" open={hints.embedded || undefined}>
              <summary>كيف أفتح في المتصفح؟</summary>
              <div>
                <p>افتح قائمة التطبيق الذي يعرض الرابط، ثم اختر «فتح في المتصفح» أو ما يشابهها. قد تختلف تسمية الخيار ومكانه حسب التطبيق وإصداره.</p>
                {hints.ios ? <p><strong>افتح في Safari:</strong> إذا لم تجد الخيار، انسخ الرابط أدناه، وافتح Safari بنفسك، ثم الصقه في شريط العنوان.</p> : hints.android ? <>
                  {!hints.embedded && !externalAttempted && <a className="install-button install-button--outline" href={ANDROID_CHROME_INTENT} onClick={() => setExternalAttempted(true)}>فتح في Chrome<ExternalLink size={17} aria-hidden="true" /></a>}
                  <p className="install-small" role={externalAttempted ? 'status' : undefined}>{externalAttempted ? 'إذا لم يفتح Chrome، انسخ الرابط أدناه وافتحه من المتصفح بنفسك.' : 'يمكنك تجربة فتح Chrome. قد يمنع التطبيق الحالي فتح متصفح خارجي؛ يبقى نسخ الرابط متاحًا.'}</p>
                </> : <p>يمكنك نسخ الرابط وفتحه في متصفح آخر، أو اتباع إرشادات متصفحك لإضافة الموقع.</p>}
              </div>
            </details>
          </>}

          <div className="install-copy-area">
            <span>رابط واحد لك ولأهل حارتك</span>
            <button className="install-copy-button" type="button" onClick={copyClicked} disabled={copying}><Copy size={17} aria-hidden="true" />{copying ? 'جارٍ النسخ…' : 'نسخ الرابط'}</button>
          </div>
          <p className="install-copy-feedback" role="status">{copyState === 'copied' ? 'تم نسخ الرابط.' : copyState === 'manual' ? 'تعذّر النسخ التلقائي. الرابط محدد أدناه؛ اضغط عليه مطولًا أو استخدم أمر النسخ في جهازك.' : ''}</p>
          {copyState === 'manual' && <input className="install-manual-link" ref={manualLink} type="url" dir="ltr" readOnly value={INSTALL_URL} aria-label="رابط تثبيت التطبيق للنسخ اليدوي" onFocus={(event) => event.target.select()} />}
          <Link to="/" className="install-button install-button--secondary">الدخول إلى التطبيق<ArrowLeft size={19} aria-hidden="true" /></Link>
          <p className="install-small install-optional">التثبيت اختياري. يمكنك الدخول والتصفح كالمعتاد.</p>
          {!canPrompt && !installing && <>
            <InstallationSteps ios={hints.ios} android={hints.android} />
            <p className="install-availability">{hints.ios ? 'تنبيهات الآيفون والآيباد مدعومة لتطبيقات الشاشة الرئيسية على iOS وiPadOS 16.4 فأحدث. فعّلها من داخل دور المي عندما ترغب.' : 'قد يختلف خيار التثبيت أو لا يظهر وفق شروط المتصفح وإعدادات جهازك. يمكنك دائمًا متابعة استخدام الموقع.'}</p>
          </>}
        </>}
      </section>
    </main>
    <footer className="install-footer">دور المي · مجلس قروي تلفيت<span>خدمة قريبة منك، كل يوم.</span></footer>
  </div>;
}
