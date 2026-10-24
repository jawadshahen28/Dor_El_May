import { Route, Routes } from 'react-router';
import { AnnouncementsLayout } from '../layouts/AnnouncementsLayout';
import { AnnouncementsPage } from './AnnouncementsPage';
import { AnnouncementDetailsPage } from './AnnouncementDetailsPage';
import { AnnouncementState } from '../components/announcements/AnnouncementStates';

export function AnnouncementsRoutes() {
  return <Routes><Route element={<AnnouncementsLayout />}>
    <Route index element={<AnnouncementsPage />} />
    <Route path=":id" element={<AnnouncementDetailsPage />} />
    <Route path="*" element={<AnnouncementState notFound />} />
  </Route></Routes>;
}
