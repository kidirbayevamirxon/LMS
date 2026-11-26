import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Request } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { recordAuditLog } from '../../utils/audit.js';
import { hashToken } from '../../utils/crypto.js';
import { UnauthorizedError, ValidationError } from '../../utils/errors.js';

function signAccessToken(payload: { userId: string; role: string; fullName: string; phone: string }): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

async function issueTokens(
  user: {
    id: string;
    fullName: string;
    phone: string;
    role: { name: string };
  },
  deviceInfo?: string,
) {
  const accessToken = signAccessToken({
    userId: user.id,
    role: user.role.name,
    fullName: user.fullName,
    phone: user.phone,
  });

  const rawRefreshToken = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawRefreshToken),
      expiresAt,
      deviceInfo: deviceInfo ?? null,
    },
  });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  };
}

export async function loginUser(
  input: { phone: string; password: string; deviceInfo?: string },
  req: Request,
) {
  const user = await prisma.user.findUnique({
    where: { phone: input.phone.trim() },
    include: {
      role: true,
      teacher: { select: { id: true, specialization: true } },
      student: { select: { id: true, fullName: true, status: true } },
    },
  });

  if (!user || !user.isActive) {
    throw new UnauthorizedError('Telefon raqam yoki parol noto‘g‘ri');
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Telefon raqam yoki parol noto‘g‘ri');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const tokens = await issueTokens(user, input.deviceInfo);

  await recordAuditLog({
    userId: user.id,
    action: 'AUTH_LOGIN',
    entity: 'users',
    entityId: user.id,
    newValues: { deviceInfo: input.deviceInfo ?? null },
    req,
  });

  return {
    user: {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      avatarUrl: user.avatarUrl,
      language: user.language,
      role: user.role.name,
      roleDisplayName: user.role.displayName,
      permissions: user.role.permissions,
      teacherId: user.teacher?.id ?? null,
      studentId: user.student?.id ?? null,
    },
    ...tokens,
  };
}

export async function refreshUserToken(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: { role: true },
      },
    },
  });

  if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
    throw new UnauthorizedError('Refresh token yaroqsiz yoki muddati tugagan');
  }

  if (!existing.user.isActive) {
    throw new UnauthorizedError('Foydalanuvchi faol emas');
  }

  // Rotate refresh token
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });

  return issueTokens(existing.user, existing.deviceInfo ?? undefined);
}

export async function logoutUser(userId: string, refreshToken?: string, req?: Request) {
  if (refreshToken) {
    await prisma.refreshToken.updateMany({
      where: { userId, tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } else {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await recordAuditLog({
    userId,
    action: 'AUTH_LOGOUT',
    entity: 'users',
    entityId: userId,
    req,
  });
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: true,
      teacher: true,
      student: true,
    },
  });
  if (!user) throw new UnauthorizedError();

  return {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    email: user.email,
    avatarUrl: user.avatarUrl,
    language: user.language,
    role: user.role.name,
    roleDisplayName: user.role.displayName,
    permissions: user.role.permissions,
    teacher: user.teacher,
    student: user.student,
  };
}

export async function updateFcmToken(userId: string, fcmToken: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { fcmToken },
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UnauthorizedError();

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    throw new ValidationError('Joriy parol noto‘g‘ri');
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
}
