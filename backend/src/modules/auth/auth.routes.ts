import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import {
  changePasswordSchema,
  fcmTokenSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
} from './auth.schema.js';
import * as authService from './auth.service.js';

export const authRouter = Router();

authRouter.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const result = await authService.loginUser(req.body, req);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', validateBody(refreshSchema), async (req, res, next) => {
  try {
    const result = await authService.refreshUserToken(req.body.refreshToken);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', authenticate, validateBody(logoutSchema), async (req, res, next) => {
  try {
    await authService.logoutUser(req.user!.userId, req.body.refreshToken, req);
    res.json({ success: true, message: 'Tizimdan chiqildi' });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await authService.getMe(req.user!.userId);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/fcm-token', authenticate, validateBody(fcmTokenSchema), async (req, res, next) => {
  try {
    await authService.updateFcmToken(req.user!.userId, req.body.fcmToken);
    res.json({ success: true, message: 'FCM token saqlandi' });
  } catch (err) {
    next(err);
  }
});

authRouter.post(
  '/change-password',
  authenticate,
  validateBody(changePasswordSchema),
  async (req, res, next) => {
    try {
      await authService.changePassword(
        req.user!.userId,
        req.body.currentPassword,
        req.body.newPassword,
      );
      res.json({ success: true, message: 'Parol muvaffaqiyatli yangilandi' });
    } catch (err) {
      next(err);
    }
  },
);
