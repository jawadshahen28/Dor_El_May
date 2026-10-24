import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, CalendarDays, Megaphone, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAnnouncements } from '../hooks/useAnnouncements';
import { AnnouncementSkeleton, AnnouncementState } from '../components/announcements/AnnouncementStates';
import { Notice } from '../components/Notice';
import { formatAnnouncementDate } from '../utils/announcementDates';

export function AnnouncementsPage() {
  const { refresh: refreshSession } = useAuth();
  const [search, setSearch] = useSearchParams();
  const view = search.get('view') === 'recent' ? 'recent' : 'all';
  const { data, loading, pending, error, refresh, loadMore } = useAnnouncements({ view }, refreshSession);
  const from = view === 'recent' ? '/announcements?view=recent' : '/announcements';
  return <>
    <div className="announcements-intro"><div><h1><Megaphone size={27} />إعلانات المجلس</h1><p>آخر الأخبار والتنبيهات الرسمية من مجلس قروي تلفيت</p></div><Link className="announcements-back-icon" to="/home" aria-label="العودة إلى الرئيسية"><ArrowRight size={20} /></Link></div>
    <div className="announcements-toolbar"><div role="group" aria-label="تصفية الإعلانات" className="announcements-filters"><button type="button" aria-pressed={view === 'all'} onClick={() => setSearch({})}>جميع الإعلانات</button><button type="button" aria-pressed={view === 'recent'} onClick={() => setSearch({ view: 'recent' })}>الأحدث</button></div><button className="announcements-refresh" type="button" onClick={refresh} disabled={pending} aria-label="تحديث الإعلانات"><RefreshCw size={18} className={pending ? 'animate-spin' : ''} /></button></div>
    {view === 'recent' && <p className="announcements-filter-caption">الإعلانات المنشورة خلال آخر 30 يومًا</p>}
    {error && data && <Notice onRetry={refresh}>تعذّر تحديث الإعلانات. المعروض من آخر تحميل ناجح لهذه التصفية. {error}</Notice>}
    <section className="announcements-results" aria-label="إعلانات المجلس المنشورة" aria-busy={pending}>
      {loading ? <AnnouncementSkeleton /> : !data ? <AnnouncementState error={error} onRetry={refresh} /> : data.announcements.length ? <>
        <ol className="announcements-feed">{data.announcements.map((item) => <li key={item.id}><article className="announcement-card">
          <div className="announcement-card-meta"><span className="announcement-card-icon"><Megaphone size={21} strokeWidth={1.7} /></span><span><CalendarDays size={14} /><time dateTime={item.publishedAt}>{formatAnnouncementDate(item.publishedAt)}</time></span></div>
          <h2><Link to={`/announcements/${encodeURIComponent(item.id)}`} state={{ from }}>{item.title}</Link></h2><p>{item.excerpt}</p>
          <div className="announcement-card-footer"><span><ShieldCheck size={14} />مجلس قروي تلفيت</span><Link to={`/announcements/${encodeURIComponent(item.id)}`} state={{ from }} aria-label={`قراءة المزيد: ${item.title}`}>قراءة المزيد<ArrowLeft size={15} /></Link></div>
        </article></li>)}</ol>
        {data.pagination.hasMore && <button className="announcements-load-more" type="button" onClick={loadMore} disabled={pending}>{pending ? 'جارٍ تحميل المزيد…' : 'عرض المزيد من الإعلانات'}<ArrowLeft size={16} /></button>}
      </> : <AnnouncementState />}
    </section>
    <p className="announcements-timezone">تواريخ النشر بتوقيت فلسطين</p>
  </>;
}
