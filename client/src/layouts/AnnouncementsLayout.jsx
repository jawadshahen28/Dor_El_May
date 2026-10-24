import { useRef, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { HomeHeader, BottomNavigation } from '../components/home/HomeHeader';
import { HomeDialog } from '../components/home/HomeDialog';
import { Notice } from '../components/Notice';
import '../styles/home.css';
import '../styles/announcements.css';

export function AnnouncementsLayout() {
  const { user, logout } = useAuth();
  const [feature, setFeature] = useState(null);
  const [busy, setBusy] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const exiting = useRef(false);
  const navigate = useNavigate();
  async function signOut() {
    if (exiting.current) return;
    exiting.current = true;
    setBusy(true);
    setLogoutError('');
    try { await logout(); navigate('/login', { replace: true }); }
    catch (failure) { setLogoutError(failure.message); setBusy(false); exiting.current = false; }
  }
  const openFeature = (name) => name === 'schedule' ? navigate('/schedule') : setFeature(name);
  return <div className="announcements-page">
    <div className="announcements-hero"><img className="announcements-village" src="/images/talfit-village.jpg" alt="قرية تلفيت" fetchPriority="high" /><div className="announcements-hero-shade" /><HomeHeader onFeature={openFeature} onLogout={signOut} signingOut={busy} /></div>
    <main className="announcements-main"><div className="announcements-content">
      {logoutError && <Notice>{logoutError}</Notice>}
      <Outlet />
      <section className="announcements-identity" aria-label="هوية مجلس قروي تلفيت"><img className="announcements-identity-photo" src="/images/talfit-village.jpg" alt="" loading="lazy" /><div><img src="/images/talfit-council-logo.jpg" alt="شعار مجلس قروي تلفيت" width="44" height="44" /><span><strong>مجلس قروي تلفيت</strong><span>معًا لخدمة أهلنا في تلفيت</span></span></div></section>
    </div></main>
    <BottomNavigation onHome={() => navigate('/home')} onFeature={openFeature} />
    <HomeDialog feature={feature} onClose={() => setFeature(null)} user={user} onLogout={signOut} signingOut={busy} />
  </div>;
}
