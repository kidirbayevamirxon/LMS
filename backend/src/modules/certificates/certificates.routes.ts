import { CertificateStatus, RoleName } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRoles } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import * as certificatesService from './certificates.service.js';

const generateCertSchema = z.object({
  studentId: z.string().uuid(),
  courseId: z.string().uuid(),
  groupId: z.string().uuid().optional().nullable(),
  resultScore: z.string().optional(),
  status: z.nativeEnum(CertificateStatus).optional(),
});

const statusUpdateSchema = z.object({
  status: z.nativeEnum(CertificateStatus),
  revokeReason: z.string().optional(),
});

export const certificatesRouter = Router();

// Public QR verification endpoint
certificatesRouter.get('/verify/:number', async (req, res, next) => {
  try {
    const result = await certificatesService.verifyCertificateByNumber(String(req.params.number));
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

certificatesRouter.use(authenticate);

certificatesRouter.get('/', async (req, res, next) => {
  try {
    const result = await certificatesService.listCertificates(req.query as Record<string, unknown>);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

certificatesRouter.post(
  '/generate',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validateBody(generateCertSchema),
  async (req, res, next) => {
    try {
      const cert = await certificatesService.generateCertificate(req.body, req.user!.userId, req);
      res.status(201).json({ success: true, data: cert });
    } catch (err) {
      next(err);
    }
  },
);

certificatesRouter.get('/:id', async (req, res, next) => {
  try {
    const cert = await certificatesService.getCertificateById(String(req.params.id));
    res.json({ success: true, data: cert });
  } catch (err) {
    next(err);
  }
});

certificatesRouter.patch(
  '/:id/status',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN),
  validateBody(statusUpdateSchema),
  async (req, res, next) => {
    try {
      const cert = await certificatesService.updateCertificateStatus(
        String(req.params.id),
        req.body.status,
        req.body.revokeReason,
        req.user!.userId,
        req,
      );
      res.json({ success: true, data: cert });
    } catch (err) {
      next(err);
    }
  },
);

certificatesRouter.get('/:id/pdf', async (req, res, next) => {
  try {
    const pdf = await certificatesService.buildCertificatePdf(String(req.params.id));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="certificate-${req.params.id}.pdf"`);
    res.send(pdf);
  } catch (err) {
    next(err);
  }
});
