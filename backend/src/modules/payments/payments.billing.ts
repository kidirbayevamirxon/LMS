import { EnrollmentStatus, PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

export function buildDueDate(year: number, month1to12: number, dueDay: number): Date {
  const safeDay = Math.max(1, Math.min(dueDay, daysInMonth(year, month1to12)));
  return new Date(Date.UTC(year, month1to12 - 1, safeDay, 23, 59, 59));
}

function monthKey(year: number, month: number): number {
  return year * 12 + (month - 1);
}

/**
 * Ensures monthly payment schedule records exist for every month a student
 * is enrolled in active/completed groups up to the current month.
 * Also automatically transitions past-due UNPAID rows to OVERDUE.
 */
export async function syncStudentPaymentMonths(studentId?: string): Promise<void> {
  const settings = await prisma.setting.findFirst();
  const dueDay = settings?.paymentDueDay ?? 5;
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const currentKey = monthKey(currentYear, currentMonth);

  const enrollments = await prisma.groupStudent.findMany({
    where: {
      ...(studentId ? { studentId } : {}),
      status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
    },
    include: {
      student: true,
      group: { include: { course: true } },
    },
  });

  for (const enr of enrollments) {
    const startAnchor = enr.joinedAt > enr.group.startDate ? enr.joinedAt : enr.group.startDate;
    const endAnchor = enr.leftAt && enr.leftAt < enr.group.endDate ? enr.leftAt : enr.group.endDate;

    const startYear = startAnchor.getUTCFullYear();
    const startMonth = startAnchor.getUTCMonth() + 1;
    const endYear = endAnchor.getUTCFullYear();
    const endMonth = endAnchor.getUTCMonth() + 1;

    const maxKey = Math.min(currentKey, monthKey(endYear, endMonth));
    const expectedAmount = Number(
      enr.customMonthlyFee ?? enr.group.course.monthlyPrice ?? enr.student.monthlyFee ?? 0,
    );

    if (expectedAmount <= 0) continue;

    for (let k = monthKey(startYear, startMonth); k <= maxKey; k++) {
      const year = Math.floor(k / 12);
      const month = (k % 12) + 1;
      const dueDate = buildDueDate(year, month, dueDay);
      const initialStatus = dueDate < now ? PaymentStatus.OVERDUE : PaymentStatus.UNPAID;

      await prisma.paymentMonth.upsert({
        where: {
          studentId_groupId_billingYear_billingMonth: {
            studentId: enr.studentId,
            groupId: enr.groupId,
            billingYear: year,
            billingMonth: month,
          },
        },
        update: {},
        create: {
          studentId: enr.studentId,
          groupId: enr.groupId,
          courseId: enr.group.courseId,
          billingYear: year,
          billingMonth: month,
          dueDate,
          expectedAmount,
          paidAmount: 0,
          remainingDebt: expectedAmount,
          status: initialStatus,
        },
      });
    }
  }

  // Flag overdue UNPAID months whose dueDate has passed
  await prisma.paymentMonth.updateMany({
    where: {
      ...(studentId ? { studentId } : {}),
      status: PaymentStatus.UNPAID,
      dueDate: { lt: now },
      remainingDebt: { gt: 0 },
    },
    data: { status: PaymentStatus.OVERDUE },
  });
}

export async function recalculatePaymentMonth(
  tx: Prisma.TransactionClient,
  paymentMonthId: string,
) {
  const pm = await tx.paymentMonth.findUnique({
    where: { id: paymentMonthId },
    include: {
      payments: {
        where: {
          status: { notIn: [PaymentStatus.CANCELLED, PaymentStatus.REFUNDED] },
        },
      },
    },
  });

  if (!pm) return null;

  const paidSum = pm.payments.reduce((acc, p) => acc + Number(p.amount), 0);
  const expected = Number(pm.expectedAmount);
  const remaining = Math.max(0, Number((expected - paidSum).toFixed(2)));
  const now = new Date();

  let status: PaymentStatus;
  if (remaining <= 0) {
    status = PaymentStatus.PAID;
  } else if (paidSum > 0) {
    status = PaymentStatus.PARTIALLY_PAID;
  } else if (pm.dueDate < now) {
    status = PaymentStatus.OVERDUE;
  } else {
    status = PaymentStatus.UNPAID;
  }

  return tx.paymentMonth.update({
    where: { id: pm.id },
    data: {
      paidAmount: Number(paidSum.toFixed(2)),
      remainingDebt: remaining,
      status,
    },
  });
}
