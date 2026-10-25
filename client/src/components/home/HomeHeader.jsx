import { Link, useNavigate } from 'react-router';
import { Bell, CalendarDays, CircleAlert, House, LogOut, UserRound } from 'lucide-react';
import { Brand } from '../Brand';
import { useInbox } from '../../notifications/InboxContext';

export function BottomNavigation({ onHome, active = 'home' }) {
  const navigate = useNavigate();
  return <nav className="citizen-nav" aria-label="التنقل الرئيسي">
    <button type="button" className={active === 'home' ? 'is-active' : ''} aria-current={active === 'home' ? 'page' : undefined} onClick={onHome}><House size={21} /><span>الرئيسية</span></button>
    <button type="button" className={active === 'schedule' ? 'is-active' : ''} aria-current={active === 'schedule' ? 'page' : undefined} onClick={() => navigate('/schedule')}><CalendarDays size={21} /><span>جدول المياه</span></button>
    <button type="button" className={active === 'reports' ? 'is-active' : ''} aria-current={active === 'reports' ? 'page' : undefined} onClick={() => navigate('/reports')}><CircleAlert size={21} /><span>البلاغات</span></button>
    <button type="button" className={active === 'account' ? 'is-active' : ''} aria-current={active === 'account' ? 'page' : undefined} onClick={() => navigate('/account')}><UserRound size={21} /><span>حسابي</span></button>
  </nav>;
}

export function HomeHeader({ onFeature, onLogout, signingOut }) {
  const navigate = useNavigate();
  const { unreadCount } = useInbox();
  return <header className="citizen-header"><div className="citizen-header-inner">
    <Link to="/home" className="citizen-brand-lockup" aria-label="دور المي، الصفحة الرئيسية">
      <img className="citizen-council-logo" src="/images/talfit-council-logo.jpg" alt="شعار مجلس قروي تلفيت" width="58" height="58" />
      <Brand compact />
    </Link>
    <div className="citizen-header-actions">
      <button className="citizen-icon-button citizen-bell" type="button" onClick={() => navigate('/notifications')} aria-label="الإشعارات"><Bell size={21} />{unreadCount > 0 && <span className="inbox-bell-badge" aria-label={`${unreadCount} إشعارات غير مقروءة`}>{unreadCount > 99 ? '99+' : unreadCount}</span>}</button>
      <button className="citizen-logout" type="button" onClick={onLogout} disabled={signingOut} aria-label="تسجيل الخروج"><LogOut size={18} /><span>{signingOut ? 'جارٍ الخروج…' : 'تسجيل الخروج'}</span></button>
    </div>
  </div></header>;
}
