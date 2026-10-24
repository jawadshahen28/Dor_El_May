import { Link, Route, Routes } from 'react-router';
import { CitizenWorkspace } from '../layouts/CitizenWorkspace';
import { ReportsPage } from './ReportsPage';
import { AccountPage } from './AccountPage';

export function CitizenWorkspaceRoutes({ page }) {
  return <Routes><Route element={<CitizenWorkspace />}><Route index element={page === 'account' ? <AccountPage /> : <ReportsPage />} /><Route path="*" element={<div className="workspace-state"><h1>الصفحة غير موجودة</h1><Link to="/home">العودة إلى الرئيسية</Link></div>} /></Route></Routes>;
}
