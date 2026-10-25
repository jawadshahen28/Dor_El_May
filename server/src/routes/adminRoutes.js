import { Router } from 'express';
import { adminLogin } from '../controllers/adminAuthController.js';
import { logout } from '../controllers/authController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getAdminDashboard } from '../services/adminDashboard.js';
import { ADMIN_ROLES, publicAdmin } from '../utils/admin.js';
import { success } from '../utils/response.js';
import { getCouncilSchedule, getCouncilWater, createCouncilRound, changeCouncilRound } from '../services/councilWater.js';

export function adminRoutes(config, limits) {
  const router = Router();
  router.post('/login', limits.adminLoginIp, limits.adminLoginPhone, adminLogin);
  router.use(requireAuth, requireRole(...ADMIN_ROLES));
  router.get('/me', (req, res) => success(res, { admin: publicAdmin(req.user) }));
  router.get('/dashboard', async (req, res) => success(res, await getAdminDashboard(req.user)));
  router.get('/water', async (req, res) => success(res, await getCouncilWater(req.query)));
  router.get('/water-rounds', async (req, res) => success(res, await getCouncilSchedule(req.query)));
  router.post('/water-rounds', async (req, res) => {
    const result = await createCouncilRound(req.user, req.body);
    return success(res, result, result.created ? 201 : 200);
  });
  router.patch('/water-rounds/:id', async (req, res) => success(res, await changeCouncilRound(req.user, req.params.id, 'edit', req.body)));
  for (const action of ['publish', 'start', 'end', 'cancel']) {
    router.post(`/water-rounds/:id/${action}`, async (req, res) => success(res, await changeCouncilRound(req.user, req.params.id, action, req.body)));
  }
  router.post('/logout', logout(config));
  return router;
}
