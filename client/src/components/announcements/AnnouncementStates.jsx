import { AlertCircle, FileQuestion, Megaphone, RefreshCw } from 'lucide-react';

export function AnnouncementSkeleton({ details = false }) {
  return <div role="status" aria-label={details ? 'جارٍ تحميل الإعلان' : 'جارٍ تحميل إعلانات المجلس'} aria-busy="true" className="announcements-skeleton">{Array.from({ length: details ? 1 : 3 }, (_, index) => <div className="announcements-skeleton-card" key={index}><span className="citizen-skeleton" /><span className="citizen-skeleton" /><span className="citizen-skeleton" /><span className="citizen-skeleton" /></div>)}</div>;
}

export function AnnouncementState({ error, notFound, onRetry, details = false }) {
  const Icon = error ? AlertCircle : notFound ? FileQuestion : Megaphone;
  return <div className="announcements-state" role={error ? 'alert' : undefined}>
    <span className="announcements-state-icon"><Icon size={37} strokeWidth={1.5} /></span>
    <h2>{error ? (details ? 'تعذّر تحميل الإعلان' : 'تعذّر تحميل الإعلانات') : notFound ? 'الإعلان غير متاح' : 'لا توجد إعلانات جديدة حاليًا'}</h2>
    <p>{error || (notFound ? 'قد يكون الرابط غير صحيح أو لم يعد الإعلان منشورًا.' : 'ستظهر هنا إعلانات مجلس قروي تلفيت فور نشرها.')}</p>
    {error && <button type="button" onClick={onRetry}><RefreshCw size={16} />إعادة المحاولة</button>}
  </div>;
}
