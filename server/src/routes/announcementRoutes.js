import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listAnnouncements, getAnnouncement } from '../services/announcements.js';
import { success } from '../utils/response.js';

export const announcementRoutes = Router();
announcementRoutes.use(requireAuth);
announcementRoutes.get('/', async (req, res) => success(res, await listAnnouncements(req.query)));
announcementRoutes.get('/:id', async (req, res) => success(res, await getAnnouncement(req.params.id)));
