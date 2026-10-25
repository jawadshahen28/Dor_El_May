import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Bell, BellRing, CalendarDays, Check, CheckCheck, ChevronLeft, Droplets, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { HomeHeader, BottomNavigation } from '../components/home/HomeHeader';
import { CouncilSignature } from '../components/Brand';
import { Notice } from '../components/Notice';
import { NotificationControls } from '../notifications/NotificationControls';
import { useInbox } from '../notifications/InboxContext';
import { api } from '../services/api';
import { formatInstant } from '../utils/waterDates';
import { palestineDateTime, nextCalendarDate } from '@door-el-may/shared/water-time';
import '../styles/home.css';
import '../styles/inbox.css';

function groupLabel(value, reference) {
  const date = palestineDateTime(value).date, today = palestineDateTime(reference).date;
  return date === today ? 'اليوم' : nextCalendarDate(date) === today ? 'أمس' : new Intl.DateTimeFormat('ar-PS-u-nu-latn', { timeZone: 'Asia/Hebron', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
}
export function NotificationsPage() {
  const { user, logout, refresh: refreshSession } = useAuth();
  const { updateCount, refreshCount } = useInbox();
  const navigate = useNavigate();
  const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const request = useRef(null), mutation = useRef(false), lastLoad = useRef(0), dataRef = useRef(null);
  const load = useCallback(async (more = false) => {
    if (request.current || mutation.current) return;
    const cursor = more ? dataRef.current?.nextCursor : null;
    if (more && !cursor) return;
    const controller = new AbortController(); request.current = controller; setLoading(true); setError('');
    try {
      const result = await api('/notifications/inbox' + (cursor ? '?before=' + encodeURIComponent(cursor) : ''), { signal: controller.signal });
      if (controller.signal.aborted) return;
      const prior = cursor ? dataRef.current?.notifications || [] : [];
      const merged = { ...result, notifications: [...new Map([...prior, ...result.notifications].map((item) => [item.id, item])).values()] };
      dataRef.current = merged; setData(merged); updateCount(result.unreadCount); lastLoad.current = Date.now();
    } catch (failure) { if (!controller.signal.aborted) { if (failure.status === 401 || failure.status === 403) await refreshSession(); else setError(failure.message); } }
    finally { if (request.current === controller) { request.current = null; setLoading(false); } }
  }, [updateCount, refreshSession]);
  useEffect(() => {
    load();
    const revisit = () => { if (document.visibilityState === 'visible' && navigator.onLine && Date.now() - lastLoad.current > 10000) load(); };
    window.addEventListener('focus', revisit); document.addEventListener('visibilitychange', revisit);
    const interval = setInterval(revisit, 60000);
    return () => { request.current?.abort(); request.current = null; clearInterval(interval); window.removeEventListener('focus', revisit); document.removeEventListener('visibilitychange', revisit); };
  }, [load, user.id]);
  async function mark(id) {
    if (mutation.current || loading) return false;
    mutation.current = true; setBusy(true); setError('');
    try {
      const result = await api(id ? `/notifications/inbox/${id}/read` : '/notifications/read-all', { method: 'POST' });
      setData((current) => {
        const next = { ...current, unreadCount: result.unreadCount, notifications: current.notifications.map((item) => id ? item.id === id ? result.notification : item : { ...item, readAt: item.readAt || result.readAt }) };
        dataRef.current = next; return next;
      });
      updateCount(result.unreadCount); return true;
    } catch (failure) { if ([401, 403].includes(failure.status) && !['CSRF_INVALID', 'ORIGIN_INVALID'].includes(failure.code)) await refreshSession(); else setError(failure.message); return false; }
    finally { mutation.current = false; setBusy(false); }
  }
  async function open(event, item) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (loading || busy) return;
    if (item.readAt || await mark(item.id)) navigate(item.url);
  }
  async function signOut() {
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setError('');
    try { await logout(); navigate('/login', { replace: true }); }
    catch (failure) { setError(failure.message); }
    finally { mutation.current = false; setBusy(false); }
  }
  const groups = [];
  for (const item of data?.notifications || []) {
    const key = palestineDateTime(item.occurredAt).date;
    let group = groups.at(-1);
    if (group?.key !== key) { group = { key, label: groupLabel(item.occurredAt, data.generatedAt), items: [] }; groups.push(group); }
    group.items.push(item);
  }
  return <div className="inbox-page" dir="rtl">
    <HomeHeader onLogout={signOut} signingOut={busy} />
    <main className="inbox-main">
      <div className="inbox-heading"><div><span className="inbox-eyebrow"><Bell size={15} />آخر أخبار حارتك</span><h1>الإشعارات</h1><p>مواعيد المياه وتنبيهات المجلس، محفوظة لك في مكان واحد.</p></div><button className="inbox-refresh" type="button" aria-label="تحديث الإشعارات" onClick={() => { load(); refreshCount(true); }} disabled={loading || busy}><RefreshCw size={19} className={loading ? 'animate-spin' : ''} /></button></div>
      <div className="inbox-grid"><section className="inbox-feed" aria-label="سجل الإشعارات" aria-busy={loading}>
        <div className="inbox-toolbar"><h2>كل الإشعارات <span>{data ? `${data.unreadCount} غير مقروءة` : 'جارٍ التحديث'}</span></h2><button type="button" onClick={() => mark()} disabled={busy || loading || !data?.unreadCount}><CheckCheck size={17} />تحديد الكل كمقروء</button></div>
        {error && <Notice onRetry={() => load()}>{error}</Notice>}
        {!data && loading ? <div className="inbox-skeleton" aria-label="جارٍ تحميل الإشعارات">{[0, 1, 2].map((value) => <div key={value}><span className="citizen-skeleton" /><div><i className="citizen-skeleton" /><i className="citizen-skeleton" /><i className="citizen-skeleton" /></div></div>)}</div>
          : !data ? <div className="inbox-empty"><Bell size={35} /><h2>تعذّر تحميل الإشعارات</h2><p>حاول مجددًا لاستعادة آخر أخبار المياه.</p><button type="button" onClick={() => load()}>إعادة المحاولة</button></div>
            : !data.notifications.length ? <div className="inbox-empty"><span><BellRing size={34} strokeWidth={1.5} /></span><h2>كل أخبار المياه… ستجدها هنا</h2><p>لا توجد إشعارات بعد. سنحفظ لك مواعيد دور حارتك وتنبيهات بدء الضخ عند إعلانها من المجلس.</p><Link to="/schedule">استعرض جدول المياه<ChevronLeft size={16} /></Link></div>
              : groups.map((group) => <section className="inbox-group" key={group.key} aria-label={group.label}><h3>{group.label}</h3><ol>{group.items.map((item) => {
                const Icon = item.type === 'pumping_started' ? Droplets : CalendarDays;
                return <li key={item.id} className={`inbox-item${item.readAt ? '' : ' inbox-item--unread'}`} data-notification-id={item.id}><span className={`inbox-type inbox-type--${item.type}`}><Icon size={23} strokeWidth={1.7} /></span><div className="inbox-copy"><div className="inbox-item-heading"><h4><Link to={item.url} onClick={(event) => open(event, item)}>{item.title}</Link></h4>{!item.readAt && <span className="inbox-unread-dot" aria-label="غير مقروء" />}</div><p>{item.body}</p><div className="inbox-item-footer"><time dateTime={item.occurredAt}>{formatInstant(item.occurredAt)}</time>{item.readAt ? <span className="inbox-read"><Check size={13} />مقروء</span> : <button type="button" onClick={() => mark(item.id)} disabled={busy || loading}><Check size={14} />تحديد كمقروء</button>}</div></div></li>;
              })}</ol></section>)}
        {data?.nextCursor && <button className="inbox-more" type="button" onClick={() => load(true)} disabled={loading || busy}>{loading ? 'جارٍ التحميل…' : 'عرض إشعارات أقدم'}<ChevronLeft size={16} /></button>}
      </section><aside className="inbox-sidebar" aria-label="تنبيهات الجهاز"><NotificationControls inbox /><div className="inbox-privacy"><ShieldCheck size={20} /><div><h2>أخبار رسمية، تخصّ حارتك</h2><p>تبقى إشعاراتك محفوظة في حسابك، حتى لو أوقفت تنبيهات الجهاز.</p></div></div></aside></div>
      <p className="inbox-source">الأوقات بتوقيت فلسطين · مجلس قروي تلفيت</p>
    </main><footer className="inbox-footer"><CouncilSignature /><span>معًا لخدمة أهلنا في تلفيت</span></footer>
    <BottomNavigation active="notifications" onHome={() => navigate('/home')} />
  </div>;
}
