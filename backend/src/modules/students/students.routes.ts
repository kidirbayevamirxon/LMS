import { RoleName } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../config/prisma.js';
import { authenticate, requireRoles } from '../../middleware/auth.middleware.js';
import { createImageUploader } from '../../middleware/upload.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { recordAuditLog } from '../../utils/audit.js';
import { NotFoundError } from '../../utils/errors.js';
import { createStudentSchema, updateStudentSchema } from './students.schema.js';
import * as studentsService from './students.service.js';

export const studentsRouter = Router();
const uploadStudentPhoto = createImageUploader('students');

studentsRouter.use(authenticate);

studentsRouter.get('/export/excel', requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.CASHIER), async (req, res, next) => {
  try {
    const buf = await studentsService.exportStudentsExcel(req.query as Record<string, unknown>);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="edumanager-students.xlsx"');
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

studentsRouter.get('/export/pdf', requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.CASHIER), async (req, res, next) => {
  try {
    const buf = await studentsService.exportStudentsPdf(req.query as Record<string, unknown>);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="edumanager-students.pdf"');
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

studentsRouter.get('/', async (req, res, next) => {
  try {
    const result = await studentsService.listStudents(req.query as Record<string, unknown>);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

studentsRouter.post(
  '/',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validateBody(createStudentSchema),
  async (req, res, next) => {
    try {
      const student = await studentsService.createStudent(req.body, req.user!.userId, req);
      res.status(201).json({ success: true, data: student });
    } catch (err) {
      next(err);
    }
  },
);

studentsRouter.get('/:id', async (req, res, next) => {
  try {
    const student = await studentsService.getStudentById(String(req.params.id));
    res.json({ success: true, data: student });
  } catch (err) {
    next(err);
  }
});

studentsRouter.patch(
  '/:id',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validateBody(updateStudentSchema),
  async (req, res, next) => {
    try {
      const student = await studentsService.updateStudent(String(req.params.id), req.body, req.user!.userId, req);
      res.json({ success: true, data: student });
    } catch (err) {
      next(err);
    }
  },
);

studentsRouter.post(
  '/:id/photo',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  uploadStudentPhoto.single('photo'),
  async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const student = await prisma.student.findUnique({ where: { id } });
      if (!student) throw new NotFoundError('O‘quvchi topilmadi');
      if (!req.file) {
        res.status(400).json({ success: false, message: 'Rasm fayli yuborilmadi' });
        return;
      }

      const photoUrl = `/uploads/students/${req.file.filename}`;
      const updated = await prisma.student.update({
        where: { id },
        data: { photoUrl },
      });

      await recordAuditLog({
        userId: req.user!.userId,
        action: 'STUDENT_PHOTO_UPLOAD',
        entity: 'students',
        entityId: id,
        newValues: { photoUrl },
        req,
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

studentsRouter.delete(
  '/:id',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  async (req, res, next) => {
    try {
      await studentsService.deleteStudent(String(req.params.id), req.user!.userId, req);
      res.json({ success: true, message: 'O‘quvchi o‘chirildi' });
    } catch (err) {
      next(err);
    }
  },
);
