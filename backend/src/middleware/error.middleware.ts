import { Prisma } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      details: err.details ?? undefined,
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: 'Validatsiya xatosi',
      details: err.flatten().fieldErrors,
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    res.status(400).json({
      success: false,
      code: 'UPLOAD_ERROR',
      message: err.message,
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        success: false,
        code: 'DUPLICATE_ENTRY',
        message: 'Bunday yozuv allaqachon mavjud',
        details: err.meta,
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Tegishli yozuv topilmadi',
      });
      return;
    }
  }

  const message = err instanceof Error ? err.message : 'Kutilmagan server xatosi';
  if (env.NODE_ENV !== 'test') {
    console.error('Unhandled error:', err);
  }
  res.status(500).json({
    success: false,
    code: 'INTERNAL_SERVER_ERROR',
    message: env.NODE_ENV === 'production' ? 'Ichki server xatosi yuz berdi' : message,
  });
}
