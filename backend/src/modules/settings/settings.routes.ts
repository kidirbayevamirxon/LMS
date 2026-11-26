import { RoleName } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { authenticate, requireRoles } from '../../middleware/auth.middleware.js';
import { createImageUploader } from '../../middleware/upload.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { recordAuditLog } from '../../utils/audit.js';
import { paginatedResponse, parsePagination } from '../../utils/pagination.js';

const updateSettingsSchema = z.object({
  centerName: z.string().min(2).optional(),
  centerPhone: z.string().optional().nullable(),
  centerAddress: z.string().optional().nullable(),
  directorName: z.string().optional().nullable(),
  currency: z.string().max(10).optional(),
  paymentDueDay: z.coerce.number().int().min(1).max(28).optional(),
  lateGraceMinutes: z.coerce.number().int().min(0).max(120).optional(),
  faceRecognitionThreshold: z.coerce.number().min(0.4).max(0.99).optional(),
  livenessRequired: z.boolean().optional(),
  defaultLanguage: z.enum(['uz', 'ru']).optional(),
  clickEnabled: z.boolean().optional(),
  paymeEnabled: z.boolean().optional(),
  fcmEnabled: z.boolean().optional(),
});

export const settingsRouter = Router();
const uploadCenterAsset = createImageUploader('center');

settingsRouter.use(authenticate);

settingsRouter.get('/', async (_req, res, next) => {
  try {
    let setting = await prisma.setting.findFirst();
    if (!setting) {
      setting = await prisma.setting.create({ data: {} });
    }
    res.json({
      success: true,
      data: {
        ...setting,
        faceRecognitionThreshold: Number(setting.faceRecognitionThreshold),
      },
    });
  } catch (err) {
    next(err);
  }
});

settingsRouter.patch(
  '/',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validateBody(updateSettingsSchema),
  async (req, res, next) => {
    try {
      let existing = await prisma.setting.findFirst();
      if (!existing) {
        existing = await prisma.setting.create({ data: {} });
      }
      const updated = await prisma.setting.update({
        where: { id: existing.id },
        data: req.body,
      });

      await recordAuditLog({
        userId: req.user!.userId,
        action: 'SETTINGS_UPDATE',
        entity: 'settings',
        entityId: updated.id,
        oldValues: existing,
        newValues: updated,
        req,
      });

      res.json({
        success: true,
        data: {
          ...updated,
          faceRecognitionThreshold: Number(updated.faceRecognitionThreshold),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

settingsRouter.post(
  '/logo',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  uploadCenterAsset.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'Fayl tanlanmadi' });
        return;
      }
      let existing = await prisma.setting.findFirst();
      if (!existing) existing = await prisma.setting.create({ data: {} });
      const centerLogoUrl = `/uploads/center/${req.file.filename}`;
      const updated = await prisma.setting.update({
        where: { id: existing.id },
        data: { centerLogoUrl },
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

settingsRouter.get('/audit-logs', requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 30);
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, fullName: true, phone: true } },
        },
      }),
      prisma.auditLog.count(),
    ]);
    res.json({ success: true, ...paginatedResponse(items, total, page, limit) });
  } catch (err) {
    next(err);
  }
});
