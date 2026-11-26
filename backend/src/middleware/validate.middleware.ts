import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { ValidationError } from '../utils/errors.js';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      next(new ValidationError('Kiritilgan ma’lumotlar noto‘g‘ri', parsed.error.flatten().fieldErrors));
      return;
    }
    req.body = parsed.data;
    next();
  };
}
