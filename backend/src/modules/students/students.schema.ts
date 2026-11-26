import { Gender, StudentStatus } from '@prisma/client';
import { z } from 'zod';

export const createStudentSchema = z.object({
  fullName: z.string().min(2, 'F.I.SH kamida 2 belgidan iborat bo‘lishi kerak'),
  phone: z.string().min(7, 'Telefon raqam noto‘g‘ri'),
  birthDate: z.coerce.date().optional().nullable(),
  gender: z.nativeEnum(Gender).default(Gender.MALE),
  address: z.string().optional().nullable(),
  parentPhone: z.string().optional().nullable(),
  enrolledAt: z.coerce.date().optional(),
  monthlyFee: z.coerce.number().nonnegative().default(0),
  status: z.nativeEnum(StudentStatus).default(StudentStatus.ACTIVE),
  notes: z.string().optional().nullable(),
  groupIds: z.array(z.string().uuid()).optional(),
  createUserAccount: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

export const updateStudentSchema = createStudentSchema
  .omit({ groupIds: true, createUserAccount: true, password: true })
  .partial();
