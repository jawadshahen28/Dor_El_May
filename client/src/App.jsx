import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { useAuth } from './context/AuthContext';
import { LoadingScreen } from './components/Brand';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { GuestPage } from './pages/GuestPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { usePwa } from './pwa/PwaProvider';
import { isCitizenRoute, isInstallationRoute } from './installation/flow';

const HomePage = lazy(() => import('./pages/HomePage').then((module) => ({ default: module.HomePage })));
const SchedulePage = lazy(() => import('./pages/SchedulePage').then((module) => ({ default: module.SchedulePage })));
const AnnouncementsRoutes = lazy(() => import('./pages/AnnouncementsRoutes').then((module) => ({ default: module.AnnouncementsRoutes })));
const CitizenWorkspaceRoutes = lazy(() => import('./pages/CitizenWorkspaceRoutes').then((module) => ({ default: module.CitizenWorkspaceRoutes })));
const AdminRoutes = lazy(() => import('./pages/admin/AdminRoutes').then((module) => ({ default: module.AdminRoutes })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then((module) => ({ default: module.NotificationsPage })));
const DownloadPage = lazy(() => import('./installation/InstallationPages').then(module => ({ default: module.DownloadPage })));
const SetupPage = lazy(() => import('./installation/InstallationPages').then(module => ({ default: module.SetupPage })));
const adminUser = (user) => ['admin', 'council_admin'].includes(user?.role);

function ProtectedRoute() { const { user } = useAuth(); return adminUser(user) ? <Navigate to="/admin" replace /> : user ? <Outlet /> : <Navigate to="/login" replace />; }
function PublicRoute() { const { user } = useAuth(); return user ? <Navigate to={adminUser(user) ? '/admin' : '/home'} replace /> : <Outlet />; }

export default function App() {
  const { status, user } = useAuth();
  const { standalone } = usePwa();
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    const titles = { '/login': 'تسجيل الدخول', '/register': 'إنشاء حساب جديد', '/home': 'الرئيسية', '/schedule': 'جدول المياه', '/announcements': 'إعلانات المجلس', '/reports': 'البلاغات', '/account': 'حسابي', '/guest': 'تصفح كزائر', '/notifications': 'الإشعارات' };
    const adminTitles = { '/admin/login': 'تسجيل دخول المجلس', '/admin/water': 'إدارة الضخ', '/admin/schedule': 'إدارة جدول المياه' };
    document.title = isInstallationRoute(pathname) ? 'دور المي | مجلس قروي تلفيت' : `${adminTitles[pathname] || (pathname.startsWith('/admin') ? 'لوحة تحكم المجلس' : titles[pathname]) || (pathname.startsWith('/announcements/') ? 'تفاصيل الإعلان' : 'دور المي')} — دور المي، تلفيت`;
  }, [pathname]);
  if (!standalone && isCitizenRoute(pathname)) return <Navigate to="/download" replace />;
  if (standalone && isInstallationRoute(pathname)) return <Navigate to="/" replace />;
  if (status === 'loading' && !isInstallationRoute(pathname)) return <LoadingScreen />;
  return <Routes>
    <Route path="/download" element={<Suspense fallback={<LoadingScreen />}><DownloadPage /></Suspense>} />
    <Route path="/setup" element={<Suspense fallback={<LoadingScreen />}><SetupPage /></Suspense>} />
    <Route path="/" element={<Navigate to={adminUser(user) ? '/admin' : user ? '/home' : '/login'} replace />} />
    <Route path="/admin/*" element={<Suspense fallback={<LoadingScreen />}><AdminRoutes /></Suspense>} />
    <Route element={<PublicRoute />}><Route path="/login" element={<LoginPage />} /><Route path="/register" element={<RegisterPage />} /></Route>
    <Route element={<ProtectedRoute />}><Route path="/home" element={<Suspense fallback={<LoadingScreen />}><HomePage /></Suspense>} /><Route path="/schedule" element={<Suspense fallback={<LoadingScreen />}><SchedulePage /></Suspense>} /><Route path="/announcements/*" element={<Suspense fallback={<LoadingScreen />}><AnnouncementsRoutes /></Suspense>} /></Route>
    <Route element={<ProtectedRoute />}><Route path="/reports/*" element={<Suspense fallback={<LoadingScreen />}><CitizenWorkspaceRoutes page="reports" /></Suspense>} /><Route path="/account/*" element={<Suspense fallback={<LoadingScreen />}><CitizenWorkspaceRoutes page="account" /></Suspense>} /></Route>
    <Route element={<ProtectedRoute />}><Route path="/notifications" element={<Suspense fallback={<LoadingScreen />}><NotificationsPage /></Suspense>} /></Route>
    <Route path="/guest" element={<GuestPage />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes>;
}
