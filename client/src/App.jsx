import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { useAuth } from './context/AuthContext';
import { LoadingScreen } from './components/Brand';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { GuestPage } from './pages/GuestPage';
import { NotFoundPage } from './pages/NotFoundPage';

const HomePage = lazy(() => import('./pages/HomePage').then((module) => ({ default: module.HomePage })));
const SchedulePage = lazy(() => import('./pages/SchedulePage').then((module) => ({ default: module.SchedulePage })));
const AnnouncementsRoutes = lazy(() => import('./pages/AnnouncementsRoutes').then((module) => ({ default: module.AnnouncementsRoutes })));
const CitizenWorkspaceRoutes = lazy(() => import('./pages/CitizenWorkspaceRoutes').then((module) => ({ default: module.CitizenWorkspaceRoutes })));
const AdminRoutes = lazy(() => import('./pages/admin/AdminRoutes').then((module) => ({ default: module.AdminRoutes })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then((module) => ({ default: module.NotificationsPage })));
const InstallPage = lazy(() => import('./pages/InstallPage').then((module) => ({ default: module.InstallPage })));
const adminUser = (user) => ['admin', 'council_admin'].includes(user?.role);

function ProtectedRoute() { const { user } = useAuth(); return adminUser(user) ? <Navigate to="/admin" replace /> : user ? <Outlet /> : <Navigate to="/login" replace />; }
function PublicRoute() { const { user } = useAuth(); return user ? <Navigate to={adminUser(user) ? '/admin' : '/home'} replace /> : <Outlet />; }

export default function App() {
  const { status, user } = useAuth();
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    const titles = { '/install': 'تثبيت التطبيق', '/login': 'تسجيل الدخول', '/register': 'إنشاء حساب جديد', '/home': 'الرئيسية', '/schedule': 'جدول المياه', '/announcements': 'إعلانات المجلس', '/reports': 'البلاغات', '/account': 'حسابي', '/guest': 'تصفح كزائر', '/notifications': 'الإشعارات' };
    const adminTitles = { '/admin/login': 'تسجيل دخول المجلس', '/admin/water': 'إدارة الضخ', '/admin/schedule': 'إدارة جدول المياه' };
    document.title = `${adminTitles[pathname] || (pathname.startsWith('/admin') ? 'لوحة تحكم المجلس' : titles[pathname.toLowerCase().replace(/\/$/, '')]) || (pathname.startsWith('/announcements/') ? 'تفاصيل الإعلان' : 'دور المي')} — دور المي، تلفيت`;
  }, [pathname]);
  if (status === 'loading' && !/^\/install\/?$/i.test(pathname)) return <LoadingScreen />;
  return <Routes>
    <Route path="/install" element={<Suspense fallback={<LoadingScreen />}><InstallPage /></Suspense>} />
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
