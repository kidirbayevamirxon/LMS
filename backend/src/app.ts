import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { swaggerSpec } from './config/swagger.js';
import { errorHandler } from './middleware/error.middleware.js';
import { attendanceRouter } from './modules/attendance/attendance.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { certificatesRouter } from './modules/certificates/certificates.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { faceRouter } from './modules/face/face.routes.js';
import { coursesRouter } from './modules/groups/courses.routes.js';
import { groupsRouter } from './modules/groups/groups.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { paymentsRouter } from './modules/payments/payments.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
import { studentsRouter } from './modules/students/students.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (env.corsOriginList.includes('*') || env.corsOriginList.includes(origin)) {
          return callback(null, true);
        }
        return callback(null, true); // Allow Capacitor WebView origins cleanly
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  if (env.NODE_ENV !== 'test') {
    app.use(morgan('combined'));
  }

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Juda ko‘p urinish. Keyinroq urinib ko‘ring.' },
  });

  const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth/login', authLimiter);

  const uploadsPath = path.resolve(process.cwd(), env.UPLOAD_DIR);
  app.use('/uploads', express.static(uploadsPath));

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        success: true,
        status: 'healthy',
        service: 'EduManager API',
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({ success: false, status: 'unhealthy' });
    }
  });

  app.get('/api/docs.json', (_req, res) => {
    res.json(swaggerSpec);
  });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/students', studentsRouter);
  app.use('/api/courses', coursesRouter);
  app.use('/api/groups', groupsRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/attendance', attendanceRouter);
  app.use('/api/face', faceRouter);
  app.use('/api/certificates', certificatesRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/settings', settingsRouter);

  app.use((_req, res) => {
    res.status(404).json({ success: false, code: 'ROUTE_NOT_FOUND', message: 'Endpoint topilmadi' });
  });

  app.use(errorHandler);
  return app;
}
