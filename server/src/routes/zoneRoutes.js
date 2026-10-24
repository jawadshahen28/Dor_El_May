import { Router } from 'express';
import { Zone } from '../models/Zone.js';
import { success } from '../utils/response.js';

export const zoneRoutes = Router();
zoneRoutes.get('/', async (_req, res) => {
  const zones = await Zone.find({ isActive: true }).sort({ createdAt: 1, _id: 1 }).select('name').lean();
  return success(res, { zones: zones.map((zone) => ({ id: String(zone._id), name: zone.name })) });
});
