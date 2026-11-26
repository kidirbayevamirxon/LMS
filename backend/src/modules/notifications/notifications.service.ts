import { NotificationType, PaymentStatus, Prisma } from '@prisma/client';
import admin from 'firebase-admin';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';

let firebaseInitialized = false;

function ensureFirebase(): boolean {
  if (firebaseInitialized) return true;
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) return false;
  try {
    const parsed = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(parsed),
      });
    }
    firebaseInitialized = true;
    return true;
  } catch (err) {
    console.warn('Firebase Admin initialization skipped:', err);
    return false;
  }
}

export interface CreateNotificationInput {
  userId?: string | null;
  studentId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function createAndDispatchNotification(input: CreateNotificationInput) {
  let sentViaPush = false;
  let pushMessageId: string | null = null;

  if (input.userId && ensureFirebase()) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { fcmToken: true },
    });
    if (user?.fcmToken) {
      try {
        pushMessageId = await admin.messaging().send({
          token: user.fcmToken,
          notification: { title: input.title, body: input.body },
          data: input.data
            ? Object.fromEntries(Object.entries(input.data).map(([k, v]) => [k, String(v)]))
            : undefined,
        });
        sentViaPush = true;
      } catch (err) {
        console.warn('FCM send failed:', err);
      }
    }
  }

  return prisma.notification.create({
    data: {
      userId: input.userId ?? null,
      studentId: input.studentId ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data ? (input.data as Prisma.InputJsonValue) : undefined,
      sentViaPush,
      pushMessageId,
    },
  });
}

export async function runPeriodicNotificationChecks(): Promise<{ created: number }> {
  let created = 0;
  const now = new Date();
  const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  // 1. Overdue payment alerts
  const overdueMonths = await prisma.paymentMonth.findMany({
    where: {
      status: PaymentStatus.OVERDUE,
      remainingDebt: { gt: 0 },
    },
    include: {
      student: true,
      course: true,
    },
    take: 50,
  });

  for (const pm of overdueMonths) {
    const alreadySentToday = await prisma.notification.findFirst({
      where: {
        studentId: pm.studentId,
        type: NotificationType.PAYMENT_OVERDUE,
        createdAt: { gte: startOfDay },
      },
    });
    if (!alreadySentToday) {
      await createAndDispatchNotification({
        userId: pm.student.userId,
        studentId: pm.studentId,
        type: NotificationType.PAYMENT_OVERDUE,
        title: 'To‘lov muddati o‘tgan',
        body: `${pm.student.fullName} — ${pm.course.name} (${pm.billingYear}-${String(pm.billingMonth).padStart(2, '0')}) uchun ${Number(pm.remainingDebt).toLocaleString('en-US')} so‘m qarz mavjud.`,
        data: { paymentMonthId: pm.id, studentId: pm.studentId },
      });
      created++;
    }
  }

  // 2. Payment due soon alerts
  const dueSoonMonths = await prisma.paymentMonth.findMany({
    where: {
      status: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIALLY_PAID] },
      remainingDebt: { gt: 0 },
      dueDate: { gte: now, lte: threeDaysLater },
    },
    include: { student: true, course: true },
    take: 50,
  });

  for (const pm of dueSoonMonths) {
    const alreadySentToday = await prisma.notification.findFirst({
      where: {
        studentId: pm.studentId,
        type: NotificationType.PAYMENT_DUE_SOON,
        createdAt: { gte: startOfDay },
      },
    });
    if (!alreadySentToday) {
      await createAndDispatchNotification({
        userId: pm.student.userId,
        studentId: pm.studentId,
        type: NotificationType.PAYMENT_DUE_SOON,
        title: 'To‘lov muddati yaqinlashmoqda',
        body: `${pm.course.name} kursi uchun ${Number(pm.remainingDebt).toLocaleString('en-US')} so‘m to‘lov muddati ${pm.dueDate.toISOString().slice(0, 10)}.`,
        data: { paymentMonthId: pm.id, studentId: pm.studentId },
      });
      created++;
    }
  }

  // 3. Groups ending soon alerts for Admins
  const endingGroups = await prisma.group.findMany({
    where: {
      status: 'ACTIVE',
      endDate: { gte: now, lte: sevenDaysLater },
    },
    include: { course: true },
  });

  if (endingGroups.length > 0) {
    const admins = await prisma.user.findMany({
      where: { role: { name: { in: ['SUPER_ADMIN', 'ADMIN'] } }, isActive: true },
      select: { id: true },
    });
    for (const g of endingGroups) {
      for (const adminUser of admins) {
        const alreadySent = await prisma.notification.findFirst({
          where: {
            userId: adminUser.id,
            type: NotificationType.COURSE_ENDING_SOON,
            createdAt: { gte: startOfDay },
          },
        });
        if (!alreadySent) {
          await createAndDispatchNotification({
            userId: adminUser.id,
            type: NotificationType.COURSE_ENDING_SOON,
            title: 'Guruh yakunlanishi yaqin',
            body: `${g.name} (${g.course.name}) guruhi ${g.endDate.toISOString().slice(0, 10)} sanasida yakunlanadi.`,
            data: { groupId: g.id },
          });
          created++;
        }
      }
    }
  }

  return { created };
}
