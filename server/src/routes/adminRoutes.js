import { Router } from 'express';
import { adminLogin } from '../controllers/adminAuthController.js';
import { logout } from '../controllers/authController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getAdminDashboard } from '../services/adminDashboard.js';
import { ADMIN_ROLES, publicAdmin } from '../utils/admin.js';
import { success } from '../utils/response.js';

export function adminRoutes(config, limits) {
  const router = Router();
  router.post('/login', limits.adminLoginIp, limits.adminLoginPhone, adminLogin);
  router.use(requireAuth, requireRole(...ADMIN_ROLES));
  router.get('/me', (req, res) => success(res, { admin: publicAdmin(req.user) }));
  router.get('/dashboard', async (req, res) => success(res, await getAdminDashboard(req.user)));
  router.post('/logout', logout(config));
  return router;
}
