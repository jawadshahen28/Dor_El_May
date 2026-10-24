import { useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { ArrowRight, CalendarDays, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAnnouncements } from '../hooks/useAnnouncements';
import { AnnouncementSkeleton, AnnouncementState } from '../components/announcements/AnnouncementStates';
import { formatAnnouncementDate } from '../utils/announcementDates';
import { Notice } from '../components/Notice';

export function AnnouncementDetailsPage() {
  const { id } = useParams();
  const { state } = useLocation();
  const { refresh: refreshSession } = useAuth();
  const { data, loading, pending, error, notFound, refresh } = useAnnouncements({ id }, refreshSession);
  const item = data?.announcement;
  const back = state?.from === '/announcements?view=recent' ? state.from : '/announcements';
  useEffect(() => { document.title = `${item?.title || (notFound ? 'الإعلان غير متاح' : 'تفاصيل الإعلان')} — دور المي، تلفيت`; }, [item, notFound]);
  return <>
    <div className="announcement-details-toolbar"><Link className="announcements-back" to={back}><ArrowRight size={17} />العودة إلى الإعلانات</Link><button type="button" className="announcements-refresh" onClick={refresh} disabled={pending} aria-label="تحديث الإعلان"><RefreshCw size={18} className={pending ? 'animate-spin' : ''} /></button></div>
    {error && item && <Notice onRetry={refresh}>تعذّر تحديث الإعلان. المعروض من آخر تحميل ناجح. {error}</Notice>}
    <section className="announcement-details" aria-label="تفاصيل إعلان المجلس" aria-busy={pending}>
      {loading ? <AnnouncementSkeleton details /> : notFound ? <AnnouncementState notFound /> : !item ? <AnnouncementState details error={error} onRetry={refresh} /> : <article className="announcement-article">
        <span className="announcement-official-label"><ShieldCheck size={16} />إعلان رسمي من مجلس قروي تلفيت</span>
        <h1>{item.title}</h1><div className="announcement-published"><CalendarDays size={16} /><time dateTime={item.publishedAt}>{formatAnnouncementDate(item.publishedAt, true)}</time><span>بتوقيت فلسطين</span></div>
        <div className="announcement-body">{item.content}</div>
        <footer><ShieldCheck size={16} />مجلس قروي تلفيت</footer>
      </article>}
    </section>
  </>;
}
