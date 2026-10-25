import { Navigate, Route, Routes } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { AdminLoginPage } from './AdminLoginPage';
import { AdminDashboardPage } from './AdminDashboardPage';
import { AdminWaterPage } from './AdminWaterPage';
import { AdminSchedulePage } from './AdminSchedulePage';
import '../../styles/admin.css';

export const isAdmin = (user) => ['admin', 'council_admin'].includes(user?.role);

export function AdminRoutes() {
  const { user } = useAuth();
  return <Routes>
    <Route path="login" element={isAdmin(user) ? <Navigate to="/admin" replace /> : <AdminLoginPage />} />
    <Route index element={isAdmin(user) ? <AdminDashboardPage /> : <Navigate to="/admin/login" replace />} />
    <Route path="water" element={isAdmin(user) ? <AdminWaterPage /> : <Navigate to="/admin/login" replace />} />
    <Route path="schedule" element={isAdmin(user) ? <AdminSchedulePage /> : <Navigate to="/admin/login" replace />} />
    <Route path="*" element={<Navigate to={isAdmin(user) ? '/admin' : '/admin/login'} replace />} />
  </Routes>;
}
