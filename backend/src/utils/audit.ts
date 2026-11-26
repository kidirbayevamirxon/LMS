import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../config/prisma.js';

export interface AuditParams {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  req?: Request;
}

export async function recordAuditLog(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        oldValues: params.oldValues ? (params.oldValues as Prisma.InputJsonValue) : undefined,
        newValues: params.newValues ? (params.newValues as Prisma.InputJsonValue) : undefined,
        ipAddress: params.req?.ip ?? params.req?.socket?.remoteAddress ?? null,
        userAgent: params.req?.headers['user-agent'] ?? null,
      },
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
