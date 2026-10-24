import { Router } from 'express';
import { register, login, me, logout } from '../controllers/authController.js';

export function authRoutes(config, limits) {
  const router = Router();
  router.get('/me', me);
  router.post('/register', limits.register, register);
  router.post('/login', limits.loginIp, limits.loginPhone, login);
  router.post('/logout', logout(config));
  return router;
}
