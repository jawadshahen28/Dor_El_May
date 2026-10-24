import { useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { HomeHeader, BottomNavigation } from '../components/home/HomeHeader';
import { HomeDialog } from '../components/home/HomeDialog';
import { CouncilSignature } from '../components/Brand';
import { Notice } from '../components/Notice';
import '../styles/home.css';
import '../styles/citizen-workspace.css';

export function CitizenWorkspace() {
  const { logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [feature, setFeature] = useState(null);
  const [busy, setBusy] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const exiting = useRef(false);
  async function signOut() {
    if (exiting.current) return;
    exiting.current = true;
    setBusy(true);
    setLogoutError('');
    try { await logout(); navigate('/login', { replace: true }); }
    catch (failure) { setLogoutError(failure.message); setBusy(false); exiting.current = false; }
  }
  return <div className="workspace-page">
    <HomeHeader onFeature={setFeature} onLogout={signOut} signingOut={busy} />
    <main className="workspace-main">{logoutError && <Notice>{logoutError}</Notice>}<Outlet context={{ signOut, busy }} /></main>
    <footer className="workspace-footer"><CouncilSignature /><span>معًا لخدمة أهلنا في تلفيت</span></footer>
    <BottomNavigation active={pathname.startsWith('/account') ? 'account' : 'reports'} onHome={() => navigate('/home')} />
    <HomeDialog feature={feature} onClose={() => setFeature(null)} />
  </div>;
}
