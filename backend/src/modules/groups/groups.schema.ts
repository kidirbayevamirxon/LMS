import { CourseStatus, GroupStatus } from '@prisma/client';
import { z } from 'zod';

export const createCourseSchema = z.object({
  name: z.string().min(2),
  durationMonths: z.coerce.number().int().min(1).max(48),
  monthlyPrice: z.coerce.number().nonnegative(),
  description: z.string().optional().nullable(),
  hasCertificate: z.boolean().default(true),
  status: z.nativeEnum(CourseStatus).default(CourseStatus.ACTIVE),
});

export const updateCourseSchema = createCourseSchema.partial();

export const createGroupSchema = z.object({
  name: z.string().min(2),
  courseId: z.string().uuid(),
  teacherId: z.string().uuid(),
  lessonDays: z.array(z.string()).min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM bo‘lishi kerak'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM bo‘lishi kerak'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  maxStudents: z.coerce.number().int().min(1).max(200).default(15),
  room: z.string().optional().nullable(),
  status: z.nativeEnum(GroupStatus).default(GroupStatus.ACTIVE),
});

export const updateGroupSchema = createGroupSchema.partial();

export const enrollStudentSchema = z.object({
  studentId: z.string().uuid(),
  customMonthlyFee: z.coerce.number().nonnegative().optional(),
  joinedAt: z.coerce.date().optional(),
});

export const transferStudentSchema = z.object({
  targetGroupId: z.string().uuid(),
  customMonthlyFee: z.coerce.number().nonnegative().optional(),
  reason: z.string().optional(),
});

export const updateStudentResultSchema = z.object({
  resultScore: z.coerce.number().min(0).max(100),
  resultGrade: z.string().min(1).max(20),
  teacherComment: z.string().optional().nullable(),
  completed: z.boolean().optional(),
});
