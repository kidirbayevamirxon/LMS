import { PaymentMethod, PaymentType } from '@prisma/client';
import { z } from 'zod';

export const createPaymentSchema = z.object({
  studentId: z.string().uuid(),
  groupId: z.string().uuid().optional(),
  paymentMonthId: z.string().uuid().optional(),
  billingYear: z.coerce.number().int().min(2020).max(2100).optional(),
  billingMonth: z.coerce.number().int().min(1).max(12).optional(),
  amount: z.coerce.number().positive('To‘lov summasi 0 dan katta bo‘lishi kerak'),
  paymentDate: z.coerce.date().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
  paymentType: z.nativeEnum(PaymentType).optional(),
  notes: z.string().optional().nullable(),
});

export const paymentActionSchema = z.object({
  reason: z.string().min(2, 'Sababni kiriting'),
});
