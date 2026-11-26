import { RoleName } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

export interface AuthPayload {
  userId: string;
  role: RoleName;
  fullName: string;
  phone: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
    const rawToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : queryToken;

    if (!rawToken) {
      throw new UnauthorizedError('Kirish tokeni topilmadi');
    }

    const decoded = jwt.verify(rawToken, env.JWT_ACCESS_SECRET) as AuthPayload;
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { role: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError('Foydalanuvchi faol emas yoki topilmadi');
    }

    req.user = {
      userId: user.id,
      role: user.role.name,
      fullName: user.fullName,
      phone: user.phone,
    };

    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      next(err);
      return;
    }
    next(new UnauthorizedError('Token yaroqsiz yoki muddati tugagan'));
  }
}

export function requireRoles(...allowedRoles: RoleName[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    if (req.user.role === RoleName.SUPER_ADMIN || allowedRoles.includes(req.user.role)) {
      next();
      return;
    }
    next(new ForbiddenError(`Ushbu amal uchun ruxsat yo'q (${req.user.role})`));
  };
}
