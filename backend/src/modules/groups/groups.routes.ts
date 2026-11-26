import { RoleName } from '@prisma/client';
import { Router } from 'express';
import { authenticate, requireRoles } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import {
  createGroupSchema,
  enrollStudentSchema,
  transferStudentSchema,
  updateGroupSchema,
  updateStudentResultSchema,
} from './groups.schema.js';
import * as groupsService from './groups.service.js';

export const groupsRouter = Router();
groupsRouter.use(authenticate);

groupsRouter.get('/', async (req, res, next) => {
  try {
    const result = await groupsService.listGroups(req.query as Record<string, unknown>, req.user);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

groupsRouter.post(
  '/',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validateBody(createGroupSchema),
  async (req, res, next) => {
    try {
      const group = await groupsService.createGroup(req.body, req.user!.userId, req);
      res.status(201).json({ success: true, data: group });
    } catch (err) {
      next(err);
    }
  },
);

groupsRouter.get('/:id', async (req, res, next) => {
  try {
    const group = await groupsService.getGroupById(String(req.params.id));
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
});

groupsRouter.delete(
  '/:id',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  async (req, res, next) => {
    try {
      await groupsService.deleteGroup(String(req.params.id), req.user!.userId, req);
      res.json({ success: true, message: 'Guruh o‘chirildi' });
    } catch (err) {
      next(err);
    }
  },
);

groupsRouter.post(
  '/:id/students/:studentId/transfer',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validateBody(transferStudentSchema),
  async (req, res, next) => {
    try {
      const transferred = await groupsService.transferStudentBetweenGroups(
        String(req.params.id),
        String(req.params.studentId),
        req.body,
        req.user!.userId,
        req,
      );
      res.json({ success: true, data: transferred });
    } catch (err) {
      next(err);
    }
  },
);

groupsRouter.patch(
  '/:id',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validateBody(updateGroupSchema),
  async (req, res, next) => {
    try {
      const group = await groupsService.updateGroup(String(req.params.id), req.body, req.user!.userId, req);
      res.json({ success: true, data: group });
    } catch (err) {
      next(err);
    }
  },
);

groupsRouter.post(
  '/:id/students',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validateBody(enrollStudentSchema),
  async (req, res, next) => {
    try {
      const enrollment = await groupsService.enrollStudentToGroup(
        String(req.params.id),
        req.body,
        req.user!.userId,
        req,
      );
      res.status(201).json({ success: true, data: enrollment });
    } catch (err) {
      next(err);
    }
  },
);

groupsRouter.delete(
  '/:id/students/:studentId',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  async (req, res, next) => {
    try {
      const updated = await groupsService.removeStudentFromGroup(
        String(req.params.id),
        String(req.params.studentId),
        req.user!.userId,
        req,
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

groupsRouter.patch(
  '/:id/students/:studentId/result',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.TEACHER),
  validateBody(updateStudentResultSchema),
  async (req, res, next) => {
    try {
      const result = await groupsService.updateStudentCourseResult(
        String(req.params.id),
        String(req.params.studentId),
        req.body,
        req.user!,
        req,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);
