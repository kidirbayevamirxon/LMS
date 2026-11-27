import { RoleName } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../config/prisma.js';
import { authenticate, requireRoles } from '../../middleware/auth.middleware.js';
import { paginatedResponse, parsePagination } from '../../utils/pagination.js';
import { runPeriodicNotificationChecks } from './notifications.service.js';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 30);
    const isAdmin = req.user!.role === RoleName.SUPER_ADMIN || req.user!.role === RoleName.ADMIN;
    let studentRecord: { id: string } | null = null;
    if (req.user!.role === RoleName.STUDENT) {
      studentRecord = await prisma.student.findUnique({
        where: { userId: req.user!.userId },
        select: { id: true },
      });
    }

    const where = isAdmin
      ? {
          OR: [{ userId: req.user!.userId }, { userId: null }],
        }
      : {
          OR: [
            { userId: req.user!.userId },
            ...(studentRecord ? [{ studentId: studentRecord.id }] : []),
          ],
        };

    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { student: { select: { id: true, fullName: true } } },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { ...where, isRead: false } }),
    ]);

    res.json({
      success: true,
      ...paginatedResponse(items, total, page, limit),
      unreadCount,
    });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.patch('/:id/read', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post('/read-all', async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { OR: [{ userId: req.user!.userId }, { userId: null }], isRead: false },
      data: { isRead: true },
    });
    res.json({ success: true, message: 'Barchasi o‘qilgan deb belgilandi' });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post('/check-reminders', requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN), async (_req, res, next) => {
  try {
    const result = await runPeriodicNotificationChecks();
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});
