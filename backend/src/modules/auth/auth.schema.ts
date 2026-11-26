import { z } from 'zod';

export const loginSchema = z.object({
  phone: z.string().min(5, 'Telefon raqamini kiriting'),
  password: z.string().min(4, 'Parol kamida 4 belgidan iborat bo‘lishi kerak'),
  deviceInfo: z.string().optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10, 'Refresh token talab qilinadi'),
});

export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});

export const fcmTokenSchema = z.object({
  fcmToken: z.string().min(10),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(4),
  newPassword: z.string().min(6, 'Yangi parol kamida 6 belgidan iborat bo‘lishi kerak'),
});
