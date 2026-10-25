import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Waves, CalendarDays, MessageSquareText, Megaphone, UsersRound, RefreshCw, Droplets, Clock3, MapPin, ArrowLeft, Inbox, CircleCheck } from 'lucide-react';
import { REPORT_TYPES, REPORT_STATUSES } from '@door-el-may/shared/reports';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { Notice } from '../../components/Notice';
import { formatInstant, formatScheduledDate, formatScheduledTime } from '../../utils/waterDates';
import { AdminLayout } from './AdminLayout';

const cards = [
  ['registeredCitizens', 'المواطنون المسجلون', UsersRound, 'حسابات المواطنين'],
  ['activePumpingRounds', 'الضخ الحالي', Droplets, 'أدوار الضخ النشطة'],
  ['upcomingWaterRounds', 'الأدوار القادمة', CalendarDays, 'أدوار منشورة ومجدولة'],
  ['newReports', 'البلاغات الجديدة', MessageSquareText, 'بانتظار المراجعة'],
  ['publishedAnnouncements', 'الإعلانات المنشورة', Megaphone, 'إعلانات المجلس المتاحة'],
];

function FutureAction({ children, to }) {
  if (to) return <Link className="admin-future" to={to}>{children}<ArrowLeft size={15} /></Link>;
  return <button className="admin-future" type="button" disabled>{children}<span>قريبًا</span><ArrowLeft size={15} /></button>;
}
function EmptyState({ icon: Icon, children, detail }) {
  return <div className="admin-empty"><span><Icon size={25} strokeWidth={1.6} /></span><strong>{children}</strong>{detail && <p>{detail}</p>}</div>;
}

export function AdminDashboardPage() {
  const { user, refresh: refreshAuth } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const request = useRef(null);
  const load = useCallback(async () => {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError('');
    try {
      const dashboard = await api('/admin/dashboard', { signal: controller.signal });
      if (!controller.signal.aborted) setData(dashboard);
    } catch (failure) {
      if (controller.signal.aborted || failure.name === 'AbortError') return;
      setData(null);
      if ([401, 403].includes(failure.status)) { await refreshAuth(); return; }
      setError(failure.message);
    } finally {
      if (request.current === controller) { request.current = null; setLoading(false); }
    }
  }, [refreshAuth]);
  useEffect(() => {
    load();
    const revisit = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('focus', revisit);
    window.addEventListener('pageshow', revisit);
    document.addEventListener('visibilitychange', revisit);
    return () => {
      request.current?.abort(); request.current = null;
      window.removeEventListener('focus', revisit);
      window.removeEventListener('pageshow', revisit);
      document.removeEventListener('visibilitychange', revisit);
    };
  }, [load]);
  const admin = data?.admin || user;
  return <AdminLayout admin={admin}>
        <div className="admin-page-heading"><div><span className="admin-eyebrow">مجلس قروي تلفيت / الرئيسية</span><h1>لوحة تحكم المجلس</h1><p>مرحبًا، {admin.fullName}<span>إدارة نظام توزيع المياه في قرية تلفيت</span></p></div><button className="admin-refresh" onClick={load} disabled={loading}><RefreshCw size={17} /><span>تحديث البيانات</span></button></div>
        {error ? <section className="admin-panel admin-load-error"><h2>تعذّر تحميل بيانات المجلس</h2><Notice onRetry={load}>{error}</Notice></section>
          : !data ? <div className="admin-loading" role="status" aria-label="جارٍ تحميل بيانات المجلس"><RefreshCw size={24} />جارٍ تحميل بيانات المجلس…</div>
          : <>
            <section className="admin-statistics" aria-label="إحصاءات المجلس" aria-busy={loading}>
              {cards.map(([key, title, Icon, detail]) => <article key={key} className={`admin-stat admin-stat--${key}`}><div><h2>{title}</h2><span className="admin-stat-icon"><Icon size={21} /></span></div><strong>{data.statistics[key].toLocaleString('ar-PS-u-nu-latn')}</strong><p>{key === 'activePumpingRounds' && data.statistics[key] === 0 ? 'لا يوجد ضخ حاليًا' : detail}</p></article>)}
            </section>
            <div className="admin-content-grid">
              <section className="admin-panel admin-pumping" aria-labelledby="admin-pumping-heading">
                <div className="admin-panel-heading"><h2 id="admin-pumping-heading"><Waves size={22} />حالة ضخ المياه الحالية</h2><span className={`admin-status ${data.activeRounds.length ? 'admin-status--active' : ''}`}>{data.activeRounds.length ? 'الضخ جارٍ' : 'لا يوجد ضخ نشط'}</span></div>
                {data.activeRounds.length ? <ul className="admin-active-list">{data.activeRounds.map((round) => <li key={round.id}><span className="admin-zone-icon"><Droplets size={22} /></span><div><h3>{round.zone.name}</h3><p><Clock3 size={14} />{round.actualStartedAt ? `بدأ الضخ: ${formatInstant(round.actualStartedAt)}` : 'لم يُسجّل وقت بدء الضخ'}</p><small>آخر تحديث: {formatInstant(round.updatedAt) || 'غير متاح'}</small></div><span className="admin-status admin-status--active">جارٍ الضخ</span></li>)}</ul>
                  : <EmptyState icon={Droplets} detail="ستظهر هنا الحارات النشطة عند إعلان بدء الضخ.">لا يوجد ضخ جارٍ حاليًا</EmptyState>}
                <div className="admin-panel-footer"><span><Clock3 size={14} />آخر تحديث للمياه: {formatInstant(data.waterLastUpdatedAt) || 'لا توجد تحديثات مسجلة'}</span><FutureAction to="/admin/water">إدارة الضخ</FutureAction></div>
              </section>
              <section className="admin-panel admin-upcoming" aria-labelledby="admin-upcoming-heading">
                <div className="admin-panel-heading"><h2 id="admin-upcoming-heading"><CalendarDays size={21} />أدوار المياه القادمة</h2><span className="admin-count">{data.statistics.upcomingWaterRounds}</span></div>
                {data.upcomingRounds.length ? <ol className="admin-round-list">{data.upcomingRounds.map((round) => <li key={round.id}><span className="admin-zone-icon"><MapPin size={19} /></span><div><h3>{round.zone.name}</h3><p>{formatScheduledDate(round.scheduledDate, data.generatedAt)} · {formatScheduledTime(round.scheduledTime)}</p></div><span className="admin-status admin-status--scheduled">مجدول</span></li>)}</ol>
                  : <EmptyState icon={CalendarDays} detail="الأدوار المنشورة فقط تظهر في هذه القائمة.">لا توجد أدوار مياه مجدولة حاليًا</EmptyState>}
                <div className="admin-panel-footer"><span>أقرب خمسة أدوار منشورة</span><FutureAction to="/admin/schedule">إدارة الجدول</FutureAction></div>
              </section>
              <section className="admin-panel admin-reports" aria-labelledby="admin-reports-heading">
                <div className="admin-panel-heading"><h2 id="admin-reports-heading"><MessageSquareText size={21} />آخر البلاغات</h2><FutureAction>عرض البلاغات</FutureAction></div>
                {data.recentReports.length ? <div className="admin-report-table"><table><thead><tr><th scope="col">نوع البلاغ</th><th scope="col">الحارة</th><th scope="col">وقت الإرسال</th><th scope="col">الحالة</th></tr></thead><tbody>{data.recentReports.map((report) => <tr key={report.id}><td>{REPORT_TYPES.find((type) => type.value === report.type)?.label || 'بلاغ'}</td><td>{report.zone?.name || 'حارة غير متاحة'}</td><td>{formatInstant(report.createdAt) || 'غير متاح'}</td><td><span className="admin-status">{REPORT_STATUSES[report.status] || report.status}</span></td></tr>)}</tbody></table></div>
                  : <EmptyState icon={Inbox} detail="ملخص آخر خمسة بلاغات، دون بيانات المواطنين الشخصية.">لا توجد بلاغات حاليًا</EmptyState>}
              </section>
            </div>
            <div className="admin-data-note"><span><CircleCheck size={15} />بيانات المجلس الرسمية</span><span>آخر قراءة: {formatInstant(data.generatedAt)} · توقيت فلسطين</span></div>
          </>}
  </AdminLayout>;
}
