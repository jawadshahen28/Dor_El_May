import { ArrowLeft, CalendarDays, Check, ChevronLeft, Clock3, Droplet, Droplets, MapPin, Megaphone, MessageSquareText, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import { formatInstant, formatNumericDate, formatScheduleDay, formatScheduledTime } from '../../utils/waterDates';
import { Link } from 'react-router';

function OfficialSource() {
  return <span className="citizen-official"><ShieldCheck size={14} aria-hidden="true" />مجلس قروي تلفيت</span>;
}

export function WelcomeCard({ user, onAccount }) {
  return <section className="citizen-welcome" aria-label="ترحيب ومعلومات الحارة">
    <button className="citizen-avatar" type="button" onClick={onAccount} aria-label="فتح حسابي"><UserRound size={25} /></button>
    <div className="citizen-welcome-content"><h1>أهلًا بك، {user.fullName}</h1><span className="citizen-zone"><MapPin size={15} /><span>حارتك: <strong>{user.zone?.name || 'الحارة غير متاحة حاليًا'}</strong></span></span></div>
  </section>;
}

export function CurrentWaterStatus({ rounds, lastUpdatedAt, onRefresh, refreshing }) {
  const active = rounds.length > 0;
  return <section className="citizen-card citizen-current" aria-labelledby="current-water-title">
    <img className="citizen-current-photo" src="/images/talfit-village.jpg" alt="" aria-hidden="true" />
    <div className="citizen-card-heading"><div className="citizen-title-with-icon"><Droplet size={18} /><h2 id="current-water-title">وين المياه شغالة حاليًا؟</h2></div><span className={`citizen-status ${active ? 'citizen-status--pumping' : 'citizen-status--quiet'}`}><span className="citizen-status-dot" />{active ? 'الضخ جارٍ' : 'بانتظار الإعلان'}</span></div>
    {active ? <ul className="citizen-active-rounds">{rounds.map((round) => <li key={round.id}><div><h3><MapPin size={18} />{round.zone.name}</h3><p>{round.actualStartedAt ? <>بدأ الضخ: <time dateTime={round.actualStartedAt}>{formatInstant(round.actualStartedAt)}</time></> : 'لم يُعلن وقت بدء الضخ بعد'}</p></div></li>)}</ul>
      : <div className="citizen-empty citizen-empty--water"><span className="citizen-water-orbit"><Droplets size={43} strokeWidth={1.25} /></span><h3>لا يوجد ضخ معلن حاليًا</h3><p>تظهر الحارات هنا عند إعلان بدء الضخ.</p></div>}
    <div className="citizen-card-foot"><OfficialSource /><span className="citizen-water-update">{lastUpdatedAt ? <><Clock3 size={12} /><span className="sr-only">آخر تحديث: </span><time dateTime={lastUpdatedAt}>{formatInstant(lastUpdatedAt)}</time></> : 'بانتظار تحديث المجلس'}<button type="button" className="citizen-refresh" onClick={onRefresh} disabled={refreshing} aria-label="تحديث المعلومات" aria-busy={refreshing}><RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /></button></span></div>
  </section>;
}

export function MyNextWaterRound({ round, zone, reference }) {
  return <section className="citizen-card citizen-my-round" aria-labelledby="my-round-title">
    <CalendarDays className="citizen-calendar-illustration" size={75} strokeWidth={1.2} aria-hidden="true" />
    <div className="citizen-title-with-icon"><CalendarDays size={22} /><h2 id="my-round-title">دور حارتي القادم</h2></div>
    <span className="citizen-my-zone"><MapPin size={14} />{zone?.name || 'الحارة غير متاحة حاليًا'}</span>
    {round ? <div className="citizen-next-content"><h3><CalendarDays size={14} /><time dateTime={round.scheduledDate}><span>{formatScheduleDay(round.scheduledDate, reference)}</span> <bdi>{formatNumericDate(round.scheduledDate)}</bdi></time></h3><p><Clock3 size={14} />{round.scheduledTime ? `الساعة ${formatScheduledTime(round.scheduledTime)}` : 'لم يتم تحديد الساعة بعد'}</p><div className="citizen-next-meta"><span className="citizen-status citizen-status--scheduled">مجدول</span><span className="citizen-timezone">بتوقيت فلسطين</span></div></div>
      : <div className="citizen-empty citizen-empty--next"><h3>لم يتم الإعلان عن موعد دور حارتك القادم</h3></div>}
  </section>;
}

export function UpcomingRounds({ rounds, zone, reference, onSchedule }) {
  return <section className="citizen-card citizen-upcoming" aria-labelledby="upcoming-title">
    <div className="citizen-card-heading"><div className="citizen-title-with-icon"><Clock3 size={22} /><h2 id="upcoming-title">الأدوار القادمة</h2></div><button className="citizen-view-all" type="button" onClick={onSchedule} aria-label="عرض جدول المياه كاملًا">عرض الكل</button></div>
    {rounds.length ? <ol className="citizen-round-list">{rounds.map((round) => {
      const mine = round.zone.id === zone?.id;
      return <li key={round.id} className={mine ? 'citizen-round-is-mine' : ''} aria-label={`${round.zone.name}${mine ? '، حارتك' : ''}`}><button className="citizen-round-row" type="button" onClick={onSchedule} aria-label={`عرض دور ${round.zone.name}`}><span className="citizen-round-icon"><MapPin size={15} /></span><div className="citizen-round-description"><h3>{round.zone.name}</h3><span className="citizen-round-meta">مجدول{mine && <span><Check size={10} />حارتك</span>}</span></div><div className="citizen-round-date"><time dateTime={round.scheduledDate}><CalendarDays size={13} /><span>{formatScheduleDay(round.scheduledDate, reference)} <bdi>{formatNumericDate(round.scheduledDate)}</bdi></span></time><span>{round.scheduledTime ? formatScheduledTime(round.scheduledTime) : 'لم يتم تحديد الساعة بعد'}</span></div><ChevronLeft size={16} className="citizen-round-chevron" /></button></li>;
    })}</ol> : <div className="citizen-empty citizen-empty--compact"><span className="citizen-empty-icon"><CalendarDays size={29} strokeWidth={1.5} /></span><h3>لم يتم الإعلان عن أدوار قادمة</h3><p>ستظهر المواعيد هنا عند نشرها من المجلس.</p></div>}
  </section>;
}

export function LatestAnnouncement({ announcement, onAll, onRead }) {
  return <section className="citizen-card citizen-announcement" aria-labelledby="announcement-title">
    <div className="citizen-card-heading"><div className="citizen-title-with-icon"><Megaphone size={21} /><h2 id="announcement-title"><Link to="/announcements">آخر إعلانات المجلس</Link></h2></div></div>
    {announcement ? <article className="citizen-announcement-content"><OfficialSource /><h3><Link to={`/announcements/${encodeURIComponent(announcement.id)}`}>{announcement.title}</Link></h3><p>{announcement.content}</p><div className="citizen-announcement-date"><CalendarDays size={14} /><time dateTime={announcement.publishedAt}>{formatInstant(announcement.publishedAt)}</time></div><button type="button" className="citizen-read-more" onClick={onRead}>قراءة الإعلان<ArrowLeft size={14} /></button></article>
      : <div className="citizen-empty citizen-empty--compact"><span className="citizen-empty-icon citizen-empty-icon--warm"><Megaphone size={29} strokeWidth={1.5} /></span><h3>لا توجد إعلانات جديدة حاليًا</h3><p>كل جديد من مجلس قروي تلفيت، بتلاقيه هون.</p></div>}
    <button type="button" className="citizen-card-link" onClick={onAll}>عرض جميع الإعلانات<ArrowLeft size={17} /></button>
  </section>;
}

export function QuickActions({ onFeature }) {
  return <section className="citizen-quick-section" aria-labelledby="quick-title"><div className="citizen-section-heading"><h2 id="quick-title">وصول سريع</h2><span>خدمات بلدنا، أقرب إلك</span></div><div className="citizen-quick-grid">
    {[{ key: 'schedule', title: 'جدول المياه', description: 'كل الأدوار في مكان واحد', icon: CalendarDays }, { key: 'complaints', title: 'تقديم شكوى', description: 'صوتك بيوصل للمجلس', icon: MessageSquareText }, { key: 'announcements', title: 'إعلانات المجلس', description: 'تابع آخر أخبار البلد', icon: Megaphone }].map(({ key, title, description, icon: Icon }) => <button key={key} className="citizen-quick-action" type="button" onClick={() => onFeature(key)}><span className="citizen-quick-icon"><Icon size={24} strokeWidth={1.7} /></span><strong>{title}</strong><span className="citizen-quick-description">{description}</span><span className="citizen-soon-label">{key === 'schedule' ? 'عرض الجدول' : key === 'announcements' ? 'عرض الإعلانات' : 'تقديم بلاغ'}</span></button>)}
  </div></section>;
}
