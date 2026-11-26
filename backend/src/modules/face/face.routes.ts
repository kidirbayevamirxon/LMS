import { RoleName } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { authenticate, requireRoles } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import * as faceService from './face.service.js';

const registerFaceSchema = z.object({
  studentId: z.string().uuid(),
  embeddings: z.array(z.array(z.number().finite()).min(64).max(1024)).min(1).max(10),
  modelVersion: z.string().default('mobilefacenet-v1'),
  livenessVerified: z.boolean().default(true),
});

const recognizeFaceSchema = z.object({
  embeddings: z.array(z.array(z.number().finite()).min(64).max(1024)).min(1).max(15),
  groupId: z.string().uuid().optional(),
  livenessPassed: z.boolean().default(true),
  checkOut: z.boolean().optional(),
});

export const faceRouter = Router();
faceRouter.use(authenticate);

faceRouter.get(
  '/profiles',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.TEACHER),
  async (_req, res, next) => {
    try {
      const profiles = await prisma.faceProfile.findMany({
        select: {
          id: true,
          studentId: true,
          embeddingDimension: true,
          modelVersion: true,
          angleCount: true,
          livenessVerified: true,
          createdAt: true,
          updatedAt: true,
          student: { select: { id: true, fullName: true, phone: true, status: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });
      res.json({ success: true, data: profiles });
    } catch (err) {
      next(err);
    }
  },
);

faceRouter.post(
  '/register',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validateBody(registerFaceSchema),
  async (req, res, next) => {
    try {
      const profile = await faceService.registerFaceProfile(req.body, req.user!.userId, req);
      res.status(201).json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  },
);

faceRouter.post(
  '/recognize',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.TEACHER),
  validateBody(recognizeFaceSchema),
  async (req, res, next) => {
    try {
      const result = await faceService.recognizeFacesAndMarkAttendance(req.body, req.user!.userId, req);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

faceRouter.delete(
  '/:studentId',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  async (req, res, next) => {
    try {
      await faceService.deleteFaceProfile(String(req.params.studentId), req.user!.userId, req);
      res.json({ success: true, message: 'Face ID ma’lumotlari o‘chirildi' });
    } catch (err) {
      next(err);
    }
  },
);
