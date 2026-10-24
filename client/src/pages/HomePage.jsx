import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertCircle, MapPin, RefreshCw } from 'lucide-react';
import { Notice } from '../components/Notice';
import { useAuth } from '../context/AuthContext';
import { CouncilSignature } from '../components/Brand';
import { BottomNavigation, HomeHeader } from '../components/home/HomeHeader';
import { WelcomeCard, CurrentWaterStatus, MyNextWaterRound, UpcomingRounds, LatestAnnouncement, QuickActions } from '../components/home/HomeCards';
import { HomeDialog } from '../components/home/HomeDialog';
import { HomeSkeleton } from '../components/home/HomeSkeleton';
import { useHomeSummary } from '../hooks/useHomeSummary';
import { formatInstant } from '../utils/waterDates';
import '../styles/home.css';

export function HomePage() {
  const { user: sessionUser, logout, refresh: refreshSession } = useAuth();
  const { summary, loading, refreshing, error, refresh } = useHomeSummary(refreshSession);
  const user = summary?.user || sessionUser;
  const [busy, setBusy] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [feature, setFeature] = useState(null);
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
  const goHome = () => { window.scrollTo({ top: 0, behavior: 'smooth' }); refresh(); };
  const openFeature = (name) => name === 'schedule' ? navigate('/schedule') : name === 'announcements' ? navigate('/announcements') : name === 'complaints' ? navigate('/reports') : name === 'account' ? navigate('/account') : setFeature(name);
  return <div className="citizen-page">
    <div className="citizen-hero">
      <img className="citizen-village" src="/images/talfit-village.jpg" alt="قرية تلفيت" fetchPriority="high" />
      <div className="citizen-hero-shade" />
      <HomeHeader onFeature={setFeature} onLogout={signOut} signingOut={busy} />
      <WelcomeCard user={user} onAccount={() => navigate('/account')} />
    </div>
    <main className="citizen-main">
      {logoutError && <Notice>{logoutError}</Notice>}
      {!summary && <div className="citizen-loading-toolbar"><span>مستجدات المجلس</span><button type="button" className="citizen-refresh" onClick={refresh} disabled={refreshing} aria-label="تحديث المعلومات" aria-busy={refreshing}><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /></button></div>}
      {error && summary && <Notice onRetry={refresh}>تعذّر تحديث المعلومات. البيانات المعروضة من آخر تحميل ناجح. {error}</Notice>}
      {loading ? <HomeSkeleton /> : !summary ? <section className="citizen-card citizen-load-error" role="alert"><AlertCircle size={38} /><h2>تعذّر تحميل آخر المستجدات</h2><p>{error || 'يرجى إعادة المحاولة.'}</p><button type="button" className="citizen-card-link" onClick={refresh}><RefreshCw size={17} />إعادة المحاولة</button></section> : <>
        <div className="citizen-water-grid"><CurrentWaterStatus rounds={summary.activeRounds} lastUpdatedAt={summary.waterLastUpdatedAt} onRefresh={refresh} refreshing={refreshing} /><MyNextWaterRound round={summary.myNextRound} zone={summary.zone} reference={summary.generatedAt} /></div>
        <div className="citizen-info-grid"><UpcomingRounds rounds={summary.upcomingRounds} zone={summary.zone} reference={summary.generatedAt} onSchedule={() => openFeature('schedule')} /><LatestAnnouncement announcement={summary.latestAnnouncement} onAll={() => openFeature('announcements')} onRead={() => navigate(`/announcements/${encodeURIComponent(summary.latestAnnouncement.id)}`)} /></div>
      </>}
      {summary && <p className="citizen-checked-at">آخر تحقق: <time dateTime={summary.generatedAt}>{formatInstant(summary.generatedAt)}</time></p>}
      <QuickActions onFeature={openFeature} />
    </main>
    <footer className="citizen-footer"><CouncilSignature /><div><span>معًا… لخدمة أهلنا في تلفيت</span><span><MapPin size={12} />تلفيت، فلسطين</span></div></footer>
    <BottomNavigation onFeature={openFeature} onHome={goHome} />
    <HomeDialog feature={feature} onClose={() => setFeature(null)} user={user} onLogout={signOut} signingOut={busy} />
  </div>;
}
