import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertCircle, CalendarDays, CalendarX2, Check, ChevronLeft, ChevronRight, Clock3, Droplets, MapPin, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { HomeHeader, BottomNavigation } from '../components/home/HomeHeader';
import { HomeDialog } from '../components/home/HomeDialog';
import { Notice } from '../components/Notice';
import { useWaterSchedule } from '../hooks/useWaterSchedule';
import { formatInstant, formatNumericDate, formatScheduleDay, formatScheduledTime } from '../utils/waterDates';
import { adjacentScheduleMonth, currentScheduleMonth, formatScheduleMonth } from '../utils/scheduleDates';
import '../styles/home.css';
import '../styles/schedule.css';

function ScheduleRow({ round, mine, reference }) {
  return <li className={`schedule-row${mine ? ' schedule-row--mine' : ''}`}>
    <div className="schedule-neighborhood"><span className="schedule-zone-icon"><MapPin size={21} strokeWidth={1.7} /></span><div><h3>{round.zone.name}</h3><div className="schedule-row-badges"><span className="schedule-status">مجدول</span>{mine && <span className="schedule-mine-label"><Check size={10} />حارتك</span>}</div></div></div>
    <time className="schedule-date" dateTime={round.scheduledDate}><span>{formatScheduleDay(round.scheduledDate, reference)}</span><bdi>{formatNumericDate(round.scheduledDate)}</bdi></time>
    <div className="schedule-time"><Clock3 size={15} /><span className="sr-only">الوقت المجدول: </span><span>{round.scheduledTime ? <time dateTime={round.scheduledTime}>{formatScheduledTime(round.scheduledTime)}</time> : 'الساعة غير محددة'}</span></div>
  </li>;
}

function PumpingCard({ round, mine }) {
  return <li className="schedule-pumping-card" data-round-id={round.id}>
    <span className="schedule-pumping-icon"><Droplets size={24} strokeWidth={1.7} /></span>
    <div><div className="schedule-pumping-heading"><h3>{round.zone.name}</h3>{mine && <span className="schedule-mine-label"><Check size={11} />حارتك</span>}</div>
      <p className="schedule-pumping-status"><i />الضخ جارٍ الآن</p>
      {round.actualStartedAt && <p className="schedule-actual-start"><Clock3 size={13} />بدأ الضخ: <time dateTime={round.actualStartedAt}>{formatInstant(round.actualStartedAt)}</time></p>}
    </div>
  </li>;
}

function ScheduleSkeleton() {
  return <div className="schedule-skeleton" role="status" aria-label="جارٍ تحميل جدول المياه" aria-busy="true">{Array.from({ length: 3 }, (_, index) => <div className="schedule-skeleton-row" key={index}><span className="citizen-skeleton" /><span className="citizen-skeleton" /><span className="citizen-skeleton" /></div>)}</div>;
}

export function SchedulePage() {
  const { user, refresh: refreshSession, logout } = useAuth();
  const [month, setMonth] = useState(currentScheduleMonth);
  const [zone, setZone] = useState('mine');
  const [feature, setFeature] = useState(null);
  const [busy, setBusy] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const exiting = useRef(false);
  const navigate = useNavigate();
  const { data, loading, refreshing, error, refresh, loadMore, zones, zonesError, retryZones } = useWaterSchedule(month, zone, refreshSession);
  async function signOut() {
    if (exiting.current) return;
    exiting.current = true;
    setBusy(true);
    setLogoutError('');
    try { await logout(); navigate('/login', { replace: true }); }
    catch (failure) { setLogoutError(failure.message); setBusy(false); exiting.current = false; }
  }
  const openFeature = (name) => {
    if (name === 'schedule') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setFeature(name);
  };
  const previous = adjacentScheduleMonth(month, -1);
  const next = adjacentScheduleMonth(month, 1);
  const active = (data?.activeRounds || []).filter((round) => round.status === 'pumping');
  const upcoming = (data?.rounds || []).filter((round) => round.status === 'scheduled');
  return <div className="schedule-page">
    <HomeHeader onFeature={openFeature} onLogout={signOut} signingOut={busy} />
    <main className="schedule-main">
      <div className="schedule-intro"><h1><CalendarDays size={28} />جدول المياه</h1><p>تابع الضخ الجاري ومواعيد دور المياه القادمة</p></div>
      {logoutError && <Notice>{logoutError}</Notice>}
      <div className="schedule-scope">
        <div className="schedule-filters" role="group" aria-label="تصفية حسب الحارة">
          <button type="button" aria-pressed={zone === 'mine'} onClick={() => setZone('mine')}>حارتي</button>
          <button type="button" aria-pressed={zone === 'all'} onClick={() => setZone('all')}>كل الحارات</button>
        </div>
        <label className="schedule-zone-picker"><span className="sr-only">حارة محددة</span><MapPin size={16} aria-hidden="true" /><select aria-label="حارة محددة" value={['all', 'mine'].includes(zone) ? '' : zone} disabled={!zones?.length} onChange={(event) => setZone(event.target.value)}><option value="" disabled>حارة محددة</option>{zones?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
      {zonesError && <Notice onRetry={retryZones}>تعذّر تحميل قائمة الحارات. {zonesError}</Notice>}
      {zone === 'mine' && !user.zone && <Notice>حارة حسابك غير متاحة حاليًا. يمكنك عرض كل الحارات.</Notice>}
      {error && data && <Notice onRetry={refresh}>تعذّر تحديث الجدول. المعروض من آخر تحميل ناجح لهذه التصفية. {error}</Notice>}
      <section className="schedule-results" aria-label="أدوار المياه المعلنة" aria-busy={refreshing}>
        <section className="schedule-section" aria-labelledby="current-pumping-heading">
          <div className="schedule-section-heading"><h2 id="current-pumping-heading"><Droplets size={20} />الضخ الجاري الآن</h2>{data && active.length > 0 && <span className="schedule-section-count">{active.length}</span>}</div>
          {loading ? <div className="schedule-pumping-loading citizen-skeleton" aria-label="جارٍ التحقق من الضخ" /> : !data ? <p className="schedule-unavailable">تعذّر التحقق من حالة الضخ.</p> : active.length ? <ul className="schedule-pumping-list">{active.map((round) => <PumpingCard key={round.id} round={round} mine={round.zone.id === user.zone?.id} />)}</ul> : <div className="schedule-pumping-empty"><Droplets size={21} /><p>لا يوجد ضخ جارٍ الآن<span>تظهر الحالة عند إعلان المجلس بدء الضخ.</span></p></div>}
        </section>
        <section className="schedule-section" aria-labelledby="upcoming-rounds-heading">
          <div className="schedule-section-heading"><h2 id="upcoming-rounds-heading"><CalendarDays size={20} />الأدوار القادمة</h2>{data && <span className="schedule-section-count">{data.pagination.total}</span>}</div>
          <div className="schedule-month-navigation" role="group" aria-label="اختيار الشهر">
            <button type="button" aria-label="الشهر السابق" disabled={!previous} onClick={() => setMonth(previous)}><ChevronRight size={23} /></button>
            <h3 aria-live="polite"><CalendarDays size={18} /><time dateTime={month}>{formatScheduleMonth(month)}</time></h3>
            <button type="button" aria-label="الشهر التالي" disabled={!next} onClick={() => setMonth(next)}><ChevronLeft size={23} /></button>
          </div>
          {month !== currentScheduleMonth() && <button className="schedule-return-current" type="button" onClick={() => setMonth(currentScheduleMonth())}>العودة للشهر الحالي</button>}
          {loading ? <ScheduleSkeleton /> : !data ? <div className="schedule-state schedule-state--error" role="alert"><AlertCircle size={30} /><h3>تعذّر تحميل جدول المياه</h3><p>{error}</p><button type="button" onClick={refresh}><RefreshCw size={16} />إعادة المحاولة</button></div>
            : upcoming.length ? <><ol className="schedule-list">{upcoming.map((round) => <ScheduleRow key={round.id} round={round} mine={round.zone.id === user.zone?.id} reference={data.generatedAt} />)}</ol>{data.pagination.hasMore && <button className="schedule-load-more" type="button" onClick={loadMore} disabled={refreshing}>{refreshing ? 'جارٍ التحميل…' : 'عرض المزيد من الأدوار'}<ChevronLeft size={16} /></button>}</>
              : <div className="schedule-state"><span className="schedule-empty-icon"><CalendarX2 size={28} strokeWidth={1.5} /></span><h3>لا توجد أدوار مياه معلنة لهذه الفترة</h3><p>ستظهر الأدوار القادمة هنا عند نشرها من المجلس.<br />يمكنك اختيار شهر آخر أو عرض كل الحارات.</p></div>}
        </section>
      </section>
      <footer className="schedule-source"><span><ShieldCheck size={16} />مصدر البيانات: مجلس قروي تلفيت</span><button type="button" onClick={refresh} disabled={refreshing} aria-label="تحديث جدول المياه"><RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} /></button></footer>
      <p className="schedule-meta">المواعيد بتوقيت فلسطين{data && <> · آخر تحقق: <time dateTime={data.generatedAt}>{formatInstant(data.generatedAt)}</time></>}</p>
    </main>
    <BottomNavigation active="schedule" onFeature={openFeature} onHome={() => navigate('/home')} />
    <HomeDialog feature={feature} onClose={() => setFeature(null)} user={user} onLogout={signOut} signingOut={busy} />
  </div>;
}
