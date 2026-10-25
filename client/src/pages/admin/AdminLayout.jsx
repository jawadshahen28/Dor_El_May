import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { LayoutDashboard, Waves, CalendarDays, MessageSquareText, Megaphone, UsersRound, Settings, LogOut, UserRound, Menu, X, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Notice } from '../../components/Notice';

const navigation = [
  [LayoutDashboard, 'الرئيسية', '/admin'], [Waves, 'إدارة الضخ', '/admin/water'], [CalendarDays, 'جدول المياه', '/admin/schedule'],
  [MessageSquareText, 'البلاغات'], [Megaphone, 'إعلانات المجلس'], [UsersRound, 'المواطنون'], [Settings, 'الإعدادات'],
];
function CouncilBrand() {
  return <div className="admin-council-brand"><img src="/images/talfit-council-logo.jpg" width="48" height="48" alt="شعار مجلس قروي تلفيت" /><div><strong>مجلس قروي تلفيت</strong><span>نظام دور المي</span></div></div>;
}
function AdminNavigation({ close, logout, busy }) {
  return <><nav aria-label="تنقل إدارة المجلس" className="admin-navigation">
    {navigation.map(([Icon, label, to]) => to
      ? <NavLink key={label} to={to} end onClick={close}><Icon size={21} /><span>{label}</span></NavLink>
      : <button key={label} type="button" disabled><Icon size={21} /><span>{label}</span><small>قريبًا</small></button>)}
  </nav><div className="admin-sidebar-bottom"><span><ShieldCheck size={16} /> بوابة إدارة المجلس</span><button type="button" onClick={logout} disabled={busy}><LogOut size={19} />تسجيل الخروج</button></div></>;
}
export function AdminLayout({ children, admin: displayedAdmin }) {
  const { user, logoutAdmin, refresh } = useAuth();
  const admin = displayedAdmin || user;
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = useRef(null), pending = useRef(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1100px)');
    const resize = () => { if (query.matches) drawer.current?.close(); };
    query.addEventListener('change', resize);
    return () => query.removeEventListener('change', resize);
  }, []);
  async function logout() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await logoutAdmin(); navigate('/admin/login', { replace: true }); }
    catch (failure) { drawer.current?.close(); if ([401, 403].includes(failure.status)) await refresh(); else setError(failure.message); }
    finally { pending.current = false; setBusy(false); }
  }
  const navProps = { close: () => drawer.current?.close(), logout, busy };
  return <div className="admin-app" dir="rtl">
    <a className="admin-skip" href="#admin-main">انتقل إلى المحتوى</a>
    <aside className="admin-sidebar"><CouncilBrand /><span className="admin-nav-caption">مساحة عمل المجلس</span><AdminNavigation {...navProps} /></aside>
    <dialog id="admin-drawer" className="admin-drawer" ref={drawer} aria-labelledby="admin-drawer-title" onClose={() => setDrawerOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) drawer.current.close(); }}>
      <div className="admin-drawer-heading"><h2 id="admin-drawer-title">قائمة المجلس</h2><button type="button" className="admin-icon-button" aria-label="إغلاق القائمة" onClick={() => drawer.current.close()}><X size={23} /></button></div>
      <CouncilBrand /><AdminNavigation {...navProps} />
    </dialog>
    <div className="admin-workspace">
      <header className="admin-topbar">
        <div className="admin-topbar-brand"><button type="button" className="admin-icon-button admin-menu" aria-label="فتح قائمة المجلس" aria-expanded={drawerOpen} aria-controls="admin-drawer" onClick={() => { drawer.current.showModal(); setDrawerOpen(true); }}><Menu size={23} /></button><CouncilBrand /><span className="admin-desktop-caption">لوحة إدارة نظام دور المي</span></div>
        <div className="admin-topbar-profile"><span className="admin-avatar"><UserRound size={21} /></span><div><strong>{admin.fullName}</strong><small>مسؤول المجلس</small></div><button type="button" className="admin-icon-button" aria-label="تسجيل الخروج من المجلس" onClick={logout} disabled={busy}><LogOut size={20} /></button></div>
      </header>
      <main id="admin-main" className="admin-main" tabIndex={-1}>{error && <Notice>{error}</Notice>}{children}</main>
      <footer className="admin-footer"><span>دور المي <span>·</span> مجلس قروي تلفيت</span><span>معًا لخدمة أهلنا في تلفيت</span></footer>
    </div>
  </div>;
}
