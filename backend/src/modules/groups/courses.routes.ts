import { RoleName } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../config/prisma.js';
import { authenticate, requireRoles } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { recordAuditLog } from '../../utils/audit.js';
import { NotFoundError } from '../../utils/errors.js';
import { paginatedResponse, parsePagination } from '../../utils/pagination.js';
import { createCourseSchema, updateCourseSchema } from './groups.schema.js';

export const coursesRouter = Router();
coursesRouter.use(authenticate);

coursesRouter.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>, 50);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const where = {
      ...(status ? { status: status as never } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.course.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { groups: true, studentCourses: true } },
        },
      }),
      prisma.course.count({ where }),
    ]);

    res.json({ success: true, ...paginatedResponse(items, total, page, limit) });
  } catch (err) {
    next(err);
  }
});

coursesRouter.post(
  '/',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validateBody(createCourseSchema),
  async (req, res, next) => {
    try {
      const course = await prisma.course.create({ data: req.body });
      await recordAuditLog({
        userId: req.user!.userId,
        action: 'COURSE_CREATE',
        entity: 'courses',
        entityId: course.id,
        newValues: course,
        req,
      });
      res.status(201).json({ success: true, data: course });
    } catch (err) {
      next(err);
    }
  },
);

coursesRouter.patch(
  '/:id',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validateBody(updateCourseSchema),
  async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const existing = await prisma.course.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('Kurs topilmadi');
      const updated = await prisma.course.update({ where: { id }, data: req.body });
      await recordAuditLog({
        userId: req.user!.userId,
        action: 'COURSE_UPDATE',
        entity: 'courses',
        entityId: id,
        oldValues: existing,
        newValues: updated,
        req,
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

coursesRouter.delete(
  '/:id',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const existing = await prisma.course.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('Kurs topilmadi');
      await prisma.course.update({ where: { id }, data: { status: 'ARCHIVED' } });
      await recordAuditLog({
        userId: req.user!.userId,
        action: 'COURSE_ARCHIVE',
        entity: 'courses',
        entityId: id,
        req,
      });
      res.json({ success: true, message: 'Kurs arxivlandi' });
    } catch (err) {
      next(err);
    }
  },
);
