import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getWaterSchedule } from '../services/waterSchedule.js';
import { success } from '../utils/response.js';

export const waterRoundRoutes = Router();
waterRoundRoutes.get('/', requireAuth, async (req, res) => success(res, await getWaterSchedule(req.user, req.query)));
