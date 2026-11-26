import { AttendanceStatus, RoleName } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRoles } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import * as attendanceService from './attendance.service.js';

const singleMarkSchema = z.object({
  studentId: z.string().uuid(),
  groupId: z.string().uuid(),
  attendanceDate: z.string().optional(),
  status: z.nativeEnum(AttendanceStatus),
  checkInTime: z.string().optional().nullable(),
  checkOutTime: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const markAttendanceBodySchema = z.union([
  singleMarkSchema,
  z.object({ records: z.array(singleMarkSchema).min(1) }),
]);

export const attendanceRouter = Router();
attendanceRouter.use(authenticate);

attendanceRouter.get('/', async (req, res, next) => {
  try {
    const result = await attendanceService.listAttendance(req.query as Record<string, unknown>, req.user);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

attendanceRouter.post(
  '/',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.TEACHER),
  validateBody(markAttendanceBodySchema),
  async (req, res, next) => {
    try {
      const items = 'records' in req.body ? req.body.records : [req.body];
      const result = await attendanceService.markManualAttendance(items, req.user!, req);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

attendanceRouter.get('/student/:studentId', async (req, res, next) => {
  try {
    const result = await attendanceService.getStudentAttendance(String(req.params.studentId));
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});
