import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, CircleAlert, Clock3, MapPin, MessageSquareText, Plus, RefreshCw, X } from 'lucide-react';
import { REPORT_STATUSES, REPORT_TYPES } from '@door-el-may/shared/reports';
import { useAuth } from '../context/AuthContext';
import { useCitizenData } from '../hooks/useCitizenData';
import { ReportForm, ReportTypeIcon } from '../components/reports/ReportForm';
import { Button } from '../components/Button';
import { Notice } from '../components/Notice';
import { formatAnnouncementDate } from '../utils/announcementDates';

export function ReportsPage() {
  const { user, refresh: refreshSession } = useAuth();
  const { data, loading, pending, error, refresh, loadMore } = useCitizenData('reports', refreshSession);
  const [compose, setCompose] = useState(false), [success, setSuccess] = useState(false);
  const successRef = useRef(null);
  useEffect(() => { if (success) successRef.current?.focus(); }, [success]);
  function submitted() { setCompose(false); setSuccess(true); refresh(); }
  return <>
    <div className="workspace-intro"><h1><MessageSquareText size={27} />البلاغات</h1><p>ساعد مجلس قروي تلفيت في متابعة وصول المياه والمشاكل في حارتك</p></div>
    <div className="report-information"><CircleAlert size={24} /><div><p>بلّغنا عن وصول المياه أو أي مشكلة في حارتك، لمساعدة المجلس في متابعة الوضع.</p><span>بلاغ المواطن يساعد المتابعة، ولا يُعدّ إعلانًا رسميًا عن الضخ.</span></div></div>
    {success && <div ref={successRef} className="report-success" role="status" tabIndex="-1"><CheckCircle2 size={25} /><div><h2>تم إرسال بلاغك بنجاح</h2><p>تم تسجيل بلاغك، ويمكنك متابعة حالته من بلاغاتي السابقة.</p></div><button type="button" aria-label="إغلاق رسالة النجاح" onClick={() => setSuccess(false)}><X size={18} /></button></div>}
    <Button icon={Plus} className="report-new-button" onClick={() => { setSuccess(false); setCompose(true); }}>تقديم بلاغ جديد</Button>
    <section className="my-reports" aria-labelledby="my-reports-title" aria-busy={pending}>
      <div className="workspace-section-heading"><h2 id="my-reports-title"><Clock3 size={21} />بلاغاتي السابقة</h2><button className="workspace-refresh" type="button" onClick={refresh} disabled={pending} aria-label="تحديث بلاغاتي"><RefreshCw size={17} className={pending ? 'animate-spin' : ''} /></button></div>
      {error && data && <Notice onRetry={refresh}>تعذّر تحديث بلاغاتك. المعروض من آخر تحميل ناجح. {error}</Notice>}
      {loading ? <div className="workspace-skeleton" role="status" aria-label="جارٍ تحميل بلاغاتك">{[1, 2, 3].map((item) => <div key={item}><span className="citizen-skeleton" /><span className="citizen-skeleton" /><span className="citizen-skeleton" /></div>)}</div>
        : !data ? <div className="workspace-state" role="alert"><CircleAlert size={34} /><h3>تعذّر تحميل بلاغاتك</h3><p>{error}</p><button type="button" onClick={refresh}>إعادة المحاولة</button></div>
          : !data.reports.length ? <div className="workspace-state"><span className="workspace-empty-icon"><MessageSquareText size={36} strokeWidth={1.5} /></span><h3>لم تقم بإرسال أي بلاغات بعد</h3><p>يمكنك تقديم أول بلاغ لمساعدة المجلس في متابعة وضع المياه.</p></div>
            : <><ol className="report-history">{data.reports.map((item) => <li key={item.id}><article className="report-history-card">
              <div className="report-history-heading"><ReportTypeIcon type={item.type} /><h3>{REPORT_TYPES.find((type) => type.value === item.type)?.label || 'بلاغ مياه'}</h3><span className={`report-status report-status--${item.status}`}>{REPORT_STATUSES[item.status] || 'الحالة غير متاحة'}</span></div>
              <div className="report-history-meta"><span><MapPin size={14} />{item.zone?.name || 'الحارة غير متاحة حاليًا'}</span><time dateTime={item.createdAt}>{formatAnnouncementDate(item.createdAt, true)}</time></div>
              {item.description && <p className="report-history-preview">{item.description}</p>}
              <details className="report-details"><summary>تفاصيل البلاغ<ChevronDown size={15} /></summary><p>{item.description || 'لم تُضف تفاصيل لهذا البلاغ.'}</p></details>
            </article></li>)}</ol>{data.pagination.hasMore && <button className="workspace-more" type="button" disabled={pending} onClick={loadMore}>{pending ? 'جارٍ التحميل…' : 'عرض المزيد من بلاغاتي'}</button>}</>}
    </section>
    <p className="workspace-date-note">التواريخ بتوقيت فلسطين</p>
    {compose && <ReportForm user={user} onClose={() => setCompose(false)} onSubmitted={submitted} />}
  </>;
}
