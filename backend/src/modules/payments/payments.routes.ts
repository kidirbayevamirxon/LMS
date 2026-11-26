import { PaymentMethod, RoleName } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../config/prisma.js';
import { authenticate, requireRoles } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import {
  buildClickCheckoutUrl,
  buildPaymeCheckoutUrl,
  verifyClickSignature,
  verifyPaymeBasicAuth,
} from './payments.gateways.js';
import { createPaymentSchema, paymentActionSchema } from './payments.schema.js';
import * as paymentsService from './payments.service.js';

export const paymentsRouter = Router();

// Click & Payme Provider Webhook Endpoints (architecture ready for live merchant integration)
paymentsRouter.post('/webhooks/click', async (req, res, next) => {
  try {
    const valid = verifyClickSignature(req.body);
    if (!valid) {
      res.status(403).json({ error: -1, error_note: 'SIGN CHECK FAILED' });
      return;
    }
    const { merchant_trans_id, amount, action, click_trans_id } = req.body;
    const pm = await prisma.paymentMonth.findUnique({ where: { id: String(merchant_trans_id) } });
    if (!pm) {
      res.json({ error: -5, error_note: 'User/Order does not exist' });
      return;
    }
    if (String(action) === '1') {
      await paymentsService.createPayment(
        {
          studentId: pm.studentId,
          paymentMonthId: pm.id,
          amount: Number(amount),
          paymentMethod: PaymentMethod.CLICK,
          notes: `Click #${click_trans_id}`,
        },
        'SYSTEM_CLICK',
        req,
      );
    }
    res.json({
      click_trans_id,
      merchant_trans_id,
      merchant_prepare_id: pm.id,
      error: 0,
      error_note: 'Success',
    });
  } catch (err) {
    next(err);
  }
});

paymentsRouter.post('/webhooks/payme', async (req, res) => {
  if (!verifyPaymeBasicAuth(req.headers.authorization)) {
    res.json({ error: { code: -32504, message: 'Insufficient privilege' } });
    return;
  }
  res.json({
    result: {
      allow: true,
      method: req.body?.method ?? 'CheckPerformTransaction',
    },
  });
});

paymentsRouter.use(authenticate);

paymentsRouter.get(
  '/',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.CASHIER),
  async (req, res, next) => {
    try {
      const result = await paymentsService.listPayments(req.query as Record<string, unknown>);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  },
);

paymentsRouter.post(
  '/',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.CASHIER),
  validateBody(createPaymentSchema),
  async (req, res, next) => {
    try {
      const created = await paymentsService.createPayment(req.body, req.user!.userId, req);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  },
);

paymentsRouter.get('/debts', requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.CASHIER), async (req, res, next) => {
  try {
    const result = await paymentsService.getDebtsList(req.query as Record<string, unknown>);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

paymentsRouter.get(
  '/monthly-report',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.CASHIER),
  async (req, res, next) => {
    try {
      const result = await paymentsService.getMonthlyReport(req.query as Record<string, unknown>);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

paymentsRouter.get('/student/:studentId', async (req, res, next) => {
  try {
    const result = await paymentsService.getStudentPayments(String(req.params.studentId));
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

paymentsRouter.post(
  '/checkout-link',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.CASHIER, RoleName.STUDENT),
  async (req, res) => {
    const { provider, paymentMonthId, amount, returnUrl } = req.body;
    const result =
      provider === 'PAYME'
        ? buildPaymeCheckoutUrl({ paymentMonthId, amount: Number(amount) })
        : buildClickCheckoutUrl({ paymentMonthId, amount: Number(amount), returnUrl });
    res.json({ success: true, data: result });
  },
);

paymentsRouter.post(
  '/:id/cancel',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.CASHIER),
  validateBody(paymentActionSchema),
  async (req, res, next) => {
    try {
      const updated = await paymentsService.cancelOrRefundPayment(
        String(req.params.id),
        'CANCEL',
        req.body.reason,
        req.user!.userId,
        req,
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

paymentsRouter.post(
  '/:id/refund',
  requireRoles(RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.CASHIER),
  validateBody(paymentActionSchema),
  async (req, res, next) => {
    try {
      const updated = await paymentsService.cancelOrRefundPayment(
        String(req.params.id),
        'REFUND',
        req.body.reason,
        req.user!.userId,
        req,
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

paymentsRouter.get('/:id/receipt', async (req, res, next) => {
  try {
    const receipt = await paymentsService.getReceiptData(String(req.params.id));
    res.json({ success: true, data: receipt });
  } catch (err) {
    next(err);
  }
});

paymentsRouter.get('/:id/receipt/pdf', async (req, res, next) => {
  try {
    const pdf = await paymentsService.buildReceiptPdf(String(req.params.id));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="receipt-${req.params.id}.pdf"`);
    res.send(pdf);
  } catch (err) {
    next(err);
  }
});
