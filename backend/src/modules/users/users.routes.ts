import { RoleName, TeacherStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { authenticate, requireRoles } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { recordAuditLog } from '../../utils/audit.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';
import { paginatedResponse, parsePagination } from '../../utils/pagination.js';

const createUserSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(7),
  email: z.string().email().optional().nullable(),
  password: z.string().min(6),
  role: z.nativeEnum(RoleName),
  language: z.enum(['uz', 'ru']).default('uz'),
  specialization: z.string().optional(),
  salaryPercent: z.coerce.number().min(0).max(100).optional(),
});

const updateUserSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().min(7).optional(),
  email: z.string().email().optional().nullable(),
  password: z.string().min(6).optional(),
  role: z.nativeEnum(RoleName).optional(),
  isActive: z.boolean().optional(),
  language: z.enum(['uz', 'ru']).optional(),
  specialization: z.string().optional(),
});

export const usersRouter = Router();

usersRouter.use(authenticate);

usersRouter.get('/roles', requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN), async (_req, res, next) => {
  try {
    const roles = await prisma.role.findMany({ orderBy: { name: 'asc' } });
    res.json({ success: true, data: roles });
  } catch (err) {
    next(err);
  }
});

usersRouter.get('/teachers', requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN), async (_req, res, next) => {
  try {
    const teachers = await prisma.teacher.findMany({
      include: {
        user: { select: { id: true, fullName: true, phone: true, email: true, isActive: true } },
        _count: { select: { groups: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: teachers });
  } catch (err) {
    next(err);
  }
});

usersRouter.get('/', requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
    const roleFilter = typeof req.query.role === 'string' ? (req.query.role as RoleName) : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const where = {
      ...(roleFilter ? { role: { name: roleFilter } } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' as const } },
              { phone: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          isActive: true,
          language: true,
          lastLoginAt: true,
          createdAt: true,
          role: { select: { id: true, name: true, displayName: true } },
          teacher: { select: { id: true, specialization: true, status: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ success: true, ...paginatedResponse(items, total, page, limit) });
  } catch (err) {
    next(err);
  }
});

usersRouter.post('/', requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN), validateBody(createUserSchema), async (req, res, next) => {
  try {
    const { fullName, phone, email, password, role, language, specialization, salaryPercent } = req.body;
    const roleRecord = await prisma.role.findUnique({ where: { name: role } });
    if (!roleRecord) throw new NotFoundError('Rol topilmadi');

    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) throw new ConflictError('Bu telefon raqami bilan foydalanuvchi mavjud');

    const passwordHash = await bcrypt.hash(password, 10);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          roleId: roleRecord.id,
          fullName,
          phone,
          email: email || null,
          passwordHash,
          language,
        },
        include: { role: true },
      });

      if (role === RoleName.TEACHER) {
        await tx.teacher.create({
          data: {
            userId: user.id,
            specialization: specialization ?? 'O‘qituvchi',
            salaryPercent: salaryPercent ?? 40,
            status: TeacherStatus.ACTIVE,
          },
        });
      }

      return user;
    });

    await recordAuditLog({
      userId: req.user!.userId,
      action: 'USER_CREATE',
      entity: 'users',
      entityId: created.id,
      newValues: { fullName, phone, role },
      req,
    });

    res.status(201).json({
      success: true,
      data: {
        id: created.id,
        fullName: created.fullName,
        phone: created.phone,
        email: created.email,
        role: created.role.name,
        isActive: created.isActive,
      },
    });
  } catch (err) {
    next(err);
  }
});

usersRouter.patch('/:id', requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN), validateBody(updateUserSchema), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!existing) throw new NotFoundError('Foydalanuvchi topilmadi');

    const data: Record<string, unknown> = {};
    if (req.body.fullName !== undefined) data.fullName = req.body.fullName;
    if (req.body.phone !== undefined) data.phone = req.body.phone;
    if (req.body.email !== undefined) data.email = req.body.email;
    if (req.body.isActive !== undefined) data.isActive = req.body.isActive;
    if (req.body.language !== undefined) data.language = req.body.language;
    if (req.body.password) {
      data.passwordHash = await bcrypt.hash(req.body.password, 10);
    }
    if (req.body.role) {
      const roleRec = await prisma.role.findUnique({ where: { name: req.body.role } });
      if (!roleRec) throw new NotFoundError('Rol topilmadi');
      data.roleId = roleRec.id;
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      include: { role: true },
    });

    if (req.body.role === RoleName.TEACHER || existing.role.name === RoleName.TEACHER) {
      const teacherExists = await prisma.teacher.findUnique({ where: { userId: id } });
      if (!teacherExists && req.body.role === RoleName.TEACHER) {
        await prisma.teacher.create({
          data: { userId: id, specialization: req.body.specialization ?? 'O‘qituvchi' },
        });
      } else if (teacherExists && req.body.specialization) {
        await prisma.teacher.update({
          where: { userId: id },
          data: { specialization: req.body.specialization },
        });
      }
    }

    await recordAuditLog({
      userId: req.user!.userId,
      action: 'USER_UPDATE',
      entity: 'users',
      entityId: id,
      oldValues: { role: existing.role.name, isActive: existing.isActive },
      newValues: { role: updated.role.name, isActive: updated.isActive },
      req,
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        fullName: updated.fullName,
        phone: updated.phone,
        email: updated.email,
        role: updated.role.name,
        isActive: updated.isActive,
      },
    });
  } catch (err) {
    next(err);
  }
});
