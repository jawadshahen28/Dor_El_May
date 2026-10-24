import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getHomeSummary } from '../services/homeSummary.js';
import { success } from '../utils/response.js';

export const homeRoutes = Router();
homeRoutes.get('/summary', requireAuth, async (req, res) => success(res, await getHomeSummary(req.user)));
