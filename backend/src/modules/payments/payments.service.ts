import { EnrollmentStatus, NotificationType, PaymentMethod, PaymentStatus, PaymentType } from '@prisma/client';
import { Request } from 'express';
import PDFDocument from 'pdfkit';
import { prisma } from '../../config/prisma.js';
import { recordAuditLog } from '../../utils/audit.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { paginatedResponse, parsePagination } from '../../utils/pagination.js';
import { createAndDispatchNotification } from '../notifications/notifications.service.js';
import { buildDueDate, recalculatePaymentMonth, syncStudentPaymentMonths } from './payments.billing.js';

async function generateReceiptNumber(): Promise<string> {
  const now = new Date();
  const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const count = await prisma.payment.count();
  return `EDU-${ym}-${String(count + 1).padStart(4, '0')}-${Math.floor(100 + Math.random() * 900)}`;
}

export async function createPayment(
  input: {
    studentId: string;
    groupId?: string;
    paymentMonthId?: string;
    billingYear?: number;
    billingMonth?: number;
    amount: number;
    paymentDate?: Date;
    paymentMethod: PaymentMethod;
    paymentType?: PaymentType;
    notes?: string | null;
  },
  cashierId: string,
  req: Request,
) {
  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
    include: {
      groupStudents: {
        where: { status: EnrollmentStatus.ACTIVE },
        include: { group: { include: { course: true } } },
      },
    },
  });
  if (!student) throw new NotFoundError('O‘quvchi topilmadi');

  await syncStudentPaymentMonths(student.id);

  const settings = await prisma.setting.findFirst();
  const dueDay = settings?.paymentDueDay ?? 5;
  const paymentDate = input.paymentDate ?? new Date();

  const createdPayments = await prisma.$transaction(async (tx) => {
    const receipts = [];
    let remainingToAllocate = Number(input.amount);

    // Case 1: Specific paymentMonthId targeted
    if (input.paymentMonthId) {
      const targetPm = await tx.paymentMonth.findUnique({ where: { id: input.paymentMonthId } });
      if (!targetPm || targetPm.studentId !== student.id) {
        throw new NotFoundError('Oylik to‘lov jadvali yozuvi topilmadi');
      }

      const appliedAmount = remainingToAllocate;
      const expectedAfter = Number(targetPm.paidAmount) + appliedAmount;
      const derivedType =
        input.paymentType ??
        (expectedAfter < Number(targetPm.expectedAmount)
          ? PaymentType.PARTIAL
          : targetPm.billingYear * 12 + targetPm.billingMonth >
              new Date().getUTCFullYear() * 12 + (new Date().getUTCMonth() + 1)
            ? PaymentType.ADVANCE
            : PaymentType.REGULAR);

      const receiptNo = await generateReceiptNumber();
      const payment = await tx.payment.create({
        data: {
          receiptNumber: receiptNo,
          studentId: student.id,
          paymentMonthId: targetPm.id,
          cashierId,
          amount: appliedAmount,
          paymentDate,
          paymentMethod: input.paymentMethod,
          paymentType: derivedType,
          status:
            expectedAfter >= Number(targetPm.expectedAmount)
              ? PaymentStatus.PAID
              : PaymentStatus.PARTIALLY_PAID,
          notes: input.notes ?? null,
        },
      });
      await recalculatePaymentMonth(tx, targetPm.id);
      receipts.push(payment);
      return receipts;
    }

    // Case 2: Explicit year & month specified (can be future ADVANCE payment)
    if (input.billingYear && input.billingMonth) {
      const activeEnrollment =
        student.groupStudents.find((gs) => (input.groupId ? gs.groupId === input.groupId : true)) ??
        student.groupStudents[0];

      if (!activeEnrollment) {
        throw new ValidationError('O‘quvchi birorta ham guruhga biriktirilmagan');
      }

      const expectedAmt = Number(
        activeEnrollment.customMonthlyFee ?? activeEnrollment.group.course.monthlyPrice ?? student.monthlyFee,
      );
      const dueDate = buildDueDate(input.billingYear, input.billingMonth, dueDay);

      const pm = await tx.paymentMonth.upsert({
        where: {
          studentId_groupId_billingYear_billingMonth: {
            studentId: student.id,
            groupId: activeEnrollment.groupId,
            billingYear: input.billingYear,
            billingMonth: input.billingMonth,
          },
        },
        update: {},
        create: {
          studentId: student.id,
          groupId: activeEnrollment.groupId,
          courseId: activeEnrollment.group.courseId,
          billingYear: input.billingYear,
          billingMonth: input.billingMonth,
          dueDate,
          expectedAmount: expectedAmt,
          paidAmount: 0,
          remainingDebt: expectedAmt,
          status: PaymentStatus.UNPAID,
        },
      });

      const receiptNo = await generateReceiptNumber();
      const isFuture =
        input.billingYear * 12 + input.billingMonth >
        new Date().getUTCFullYear() * 12 + (new Date().getUTCMonth() + 1);
      const totalPaidForMonth = Number(pm.paidAmount) + remainingToAllocate;
      const derivedType =
        input.paymentType ??
        (isFuture
          ? PaymentType.ADVANCE
          : totalPaidForMonth < Number(pm.expectedAmount)
            ? PaymentType.PARTIAL
            : PaymentType.REGULAR);

      const payment = await tx.payment.create({
        data: {
          receiptNumber: receiptNo,
          studentId: student.id,
          paymentMonthId: pm.id,
          cashierId,
          amount: remainingToAllocate,
          paymentDate,
          paymentMethod: input.paymentMethod,
          paymentType: derivedType,
          status:
            totalPaidForMonth >= Number(pm.expectedAmount)
              ? PaymentStatus.PAID
              : PaymentStatus.PARTIALLY_PAID,
          notes: input.notes ?? null,
        },
      });
      await recalculatePaymentMonth(tx, pm.id);
      receipts.push(payment);
      return receipts;
    }

    // Case 3: Auto-allocate across oldest unpaid/overdue months, then advance into future months if surplus
    const openMonths = await tx.paymentMonth.findMany({
      where: {
        studentId: student.id,
        ...(input.groupId ? { groupId: input.groupId } : {}),
        remainingDebt: { gt: 0 },
        status: { notIn: [PaymentStatus.CANCELLED, PaymentStatus.REFUNDED] },
      },
      orderBy: [{ billingYear: 'asc' }, { billingMonth: 'asc' }],
    });

    for (const pm of openMonths) {
      if (remainingToAllocate <= 0) break;
      const debt = Number(pm.remainingDebt);
      const apply = Math.min(remainingToAllocate, debt);
      const receiptNo = await generateReceiptNumber();
      const payment = await tx.payment.create({
        data: {
          receiptNumber: receiptNo,
          studentId: student.id,
          paymentMonthId: pm.id,
          cashierId,
          amount: apply,
          paymentDate,
          paymentMethod: input.paymentMethod,
          paymentType: apply < debt ? PaymentType.PARTIAL : input.paymentType ?? PaymentType.REGULAR,
          status: apply >= debt ? PaymentStatus.PAID : PaymentStatus.PARTIALLY_PAID,
          notes: input.notes ?? null,
        },
      });
      await recalculatePaymentMonth(tx, pm.id);
      receipts.push(payment);
      remainingToAllocate = Number((remainingToAllocate - apply).toFixed(2));
    }

    // Advance payment allocation for remaining surplus
    if (remainingToAllocate > 0) {
      const activeEnrollment =
        student.groupStudents.find((gs) => (input.groupId ? gs.groupId === input.groupId : true)) ??
        student.groupStudents[0];
      if (!activeEnrollment) {
        throw new ValidationError('O‘quvchining faol guruhi topilmadi');
      }

      const monthlyAmt = Number(
        activeEnrollment.customMonthlyFee ?? activeEnrollment.group.course.monthlyPrice ?? student.monthlyFee,
      );
      if (monthlyAmt <= 0) {
        throw new ValidationError('Oylik to‘lov summasi 0 dan katta bo‘lishi kerak');
      }

      const latestPm = await tx.paymentMonth.findFirst({
        where: { studentId: student.id, groupId: activeEnrollment.groupId },
        orderBy: [{ billingYear: 'desc' }, { billingMonth: 'desc' }],
      });

      let nextYear = latestPm ? latestPm.billingYear : paymentDate.getUTCFullYear();
      let nextMonth = latestPm ? latestPm.billingMonth + 1 : paymentDate.getUTCMonth() + 1;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      }

      while (remainingToAllocate > 0) {
        const apply = Math.min(remainingToAllocate, monthlyAmt);
        const pm = await tx.paymentMonth.upsert({
          where: {
            studentId_groupId_billingYear_billingMonth: {
              studentId: student.id,
              groupId: activeEnrollment.groupId,
              billingYear: nextYear,
              billingMonth: nextMonth,
            },
          },
          update: {},
          create: {
            studentId: student.id,
            groupId: activeEnrollment.groupId,
            courseId: activeEnrollment.group.courseId,
            billingYear: nextYear,
            billingMonth: nextMonth,
            dueDate: buildDueDate(nextYear, nextMonth, dueDay),
            expectedAmount: monthlyAmt,
            paidAmount: 0,
            remainingDebt: monthlyAmt,
            status: PaymentStatus.UNPAID,
          },
        });

        const receiptNo = await generateReceiptNumber();
        const payment = await tx.payment.create({
          data: {
            receiptNumber: receiptNo,
            studentId: student.id,
            paymentMonthId: pm.id,
            cashierId,
            amount: apply,
            paymentDate,
            paymentMethod: input.paymentMethod,
            paymentType: PaymentType.ADVANCE,
            status: apply >= monthlyAmt ? PaymentStatus.PAID : PaymentStatus.PARTIALLY_PAID,
            notes: input.notes ?? 'Oldindan to‘lov',
          },
        });
        await recalculatePaymentMonth(tx, pm.id);
        receipts.push(payment);

        remainingToAllocate = Number((remainingToAllocate - apply).toFixed(2));
        nextMonth += 1;
        if (nextMonth > 12) {
          nextMonth = 1;
          nextYear += 1;
        }
      }
    }

    return receipts;
  });

  await recordAuditLog({
    userId: cashierId,
    action: 'PAYMENT_CREATE',
    entity: 'payments',
    entityId: createdPayments[0]?.id ?? null,
    newValues: { studentId: student.id, amount: input.amount, method: input.paymentMethod, count: createdPayments.length },
    req,
  });

  if (student.userId) {
    await createAndDispatchNotification({
      userId: student.userId,
      studentId: student.id,
      type: NotificationType.SYSTEM,
      title: 'To‘lov qabul qilindi',
      body: `${Number(input.amount).toLocaleString('en-US')} so‘m to‘lovingiz muvaffaqiyatli qabul qilindi.`,
      data: { paymentId: createdPayments[0]?.id ?? '' },
    });
  }

  return createdPayments;
}

export async function listPayments(query: Record<string, unknown>) {
  await syncStudentPaymentMonths();
  const { page, limit, skip } = parsePagination(query, 20);
  const studentId = typeof query.studentId === 'string' ? query.studentId : undefined;
  const status = typeof query.status === 'string' ? (query.status as PaymentStatus) : undefined;
  const paymentMethod = typeof query.paymentMethod === 'string' ? (query.paymentMethod as PaymentMethod) : undefined;
  const search = typeof query.search === 'string' ? query.search.trim() : '';

  const where = {
    ...(studentId ? { studentId } : {}),
    ...(status ? { status } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(search
      ? {
          OR: [
            { receiptNumber: { contains: search, mode: 'insensitive' as const } },
            { student: { fullName: { contains: search, mode: 'insensitive' as const } } },
            { student: { phone: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };

  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [items, total, todayAgg, monthAgg, totalAgg, debtAgg, unpaidStudents, partialStudents] =
    await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { paymentDate: 'desc' },
        include: {
          student: { select: { id: true, fullName: true, phone: true } },
          cashier: { select: { id: true, fullName: true } },
          paymentMonth: {
            include: {
              course: { select: { id: true, name: true } },
              group: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.payment.count({ where }),
      prisma.payment.aggregate({
        where: {
          paymentDate: { gte: startOfToday },
          status: { notIn: [PaymentStatus.CANCELLED, PaymentStatus.REFUNDED] },
        },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: {
          paymentDate: { gte: startOfMonth },
          status: { notIn: [PaymentStatus.CANCELLED, PaymentStatus.REFUNDED] },
        },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: {
          status: { notIn: [PaymentStatus.CANCELLED, PaymentStatus.REFUNDED] },
        },
        _sum: { amount: true },
      }),
      prisma.paymentMonth.aggregate({
        where: {
          remainingDebt: { gt: 0 },
          status: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIALLY_PAID, PaymentStatus.OVERDUE] },
        },
        _sum: { remainingDebt: true },
      }),
      prisma.paymentMonth.findMany({
        where: { status: { in: [PaymentStatus.UNPAID, PaymentStatus.OVERDUE] }, remainingDebt: { gt: 0 } },
        distinct: ['studentId'],
        select: { studentId: true },
      }),
      prisma.paymentMonth.findMany({
        where: { status: PaymentStatus.PARTIALLY_PAID, remainingDebt: { gt: 0 } },
        distinct: ['studentId'],
        select: { studentId: true },
      }),
    ]);

  return {
    ...paginatedResponse(items, total, page, limit),
    summary: {
      todayRevenue: Number(todayAgg._sum.amount ?? 0),
      monthlyRevenue: Number(monthAgg._sum.amount ?? 0),
      totalRevenue: Number(totalAgg._sum.amount ?? 0),
      totalDebt: Number(debtAgg._sum.remainingDebt ?? 0),
      unpaidStudentsCount: unpaidStudents.length,
      partiallyPaidStudentsCount: partialStudents.length,
    },
  };
}

export async function getStudentPayments(studentId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new NotFoundError('O‘quvchi topilmadi');

  await syncStudentPaymentMonths(studentId);

  const [paymentMonths, payments] = await Promise.all([
    prisma.paymentMonth.findMany({
      where: { studentId },
      orderBy: [{ billingYear: 'desc' }, { billingMonth: 'desc' }],
      include: {
        course: { select: { id: true, name: true } },
        group: { select: { id: true, name: true } },
        payments: { orderBy: { paymentDate: 'desc' } },
      },
    }),
    prisma.payment.findMany({
      where: { studentId },
      orderBy: { paymentDate: 'desc' },
      include: {
        cashier: { select: { id: true, fullName: true } },
        paymentMonth: { select: { billingYear: true, billingMonth: true } },
      },
    }),
  ]);

  const totalDebt = paymentMonths
    .filter((pm) => pm.status !== PaymentStatus.CANCELLED && pm.status !== PaymentStatus.REFUNDED)
    .reduce((acc, pm) => acc + Number(pm.remainingDebt), 0);

  const totalPaid = payments
    .filter((p) => p.status !== PaymentStatus.CANCELLED && p.status !== PaymentStatus.REFUNDED)
    .reduce((acc, p) => acc + Number(p.amount), 0);

  return {
    student: {
      id: student.id,
      fullName: student.fullName,
      phone: student.phone,
      monthlyFee: Number(student.monthlyFee),
    },
    totalPaid,
    totalDebt,
    paymentMonths,
    payments,
  };
}

export async function getDebtsList(query: Record<string, unknown>) {
  await syncStudentPaymentMonths();
  const minMonths = Number(query.minMonths ?? 1);
  const groupId = typeof query.groupId === 'string' ? query.groupId : undefined;

  const debtMonths = await prisma.paymentMonth.findMany({
    where: {
      remainingDebt: { gt: 0 },
      status: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIALLY_PAID, PaymentStatus.OVERDUE] },
      ...(groupId ? { groupId } : {}),
    },
    include: {
      student: { select: { id: true, fullName: true, phone: true, parentPhone: true, status: true } },
      group: { select: { id: true, name: true } },
      course: { select: { id: true, name: true } },
    },
    orderBy: [{ billingYear: 'asc' }, { billingMonth: 'asc' }],
  });

  const grouped = new Map<
    string,
    {
      student: (typeof debtMonths)[number]['student'];
      totalDebt: number;
      monthsCount: number;
      overdueMonthsCount: number;
      months: typeof debtMonths;
    }
  >();

  for (const pm of debtMonths) {
    const existing = grouped.get(pm.studentId);
    const debt = Number(pm.remainingDebt);
    const isOverdue = pm.status === PaymentStatus.OVERDUE || pm.dueDate < new Date();
    if (!existing) {
      grouped.set(pm.studentId, {
        student: pm.student,
        totalDebt: debt,
        monthsCount: 1,
        overdueMonthsCount: isOverdue ? 1 : 0,
        months: [pm],
      });
    } else {
      existing.totalDebt += debt;
      existing.monthsCount += 1;
      if (isOverdue) existing.overdueMonthsCount += 1;
      existing.months.push(pm);
    }
  }

  const debtors = Array.from(grouped.values())
    .filter((d) => d.monthsCount >= minMonths)
    .sort((a, b) => b.totalDebt - a.totalDebt);

  return {
    totalDebtors: debtors.length,
    totalDebtAmount: debtors.reduce((acc, d) => acc + d.totalDebt, 0),
    debtors,
  };
}

export async function getMonthlyReport(query: Record<string, unknown>) {
  await syncStudentPaymentMonths();
  const now = new Date();
  const year = Number(query.year ?? now.getUTCFullYear());
  const month = Number(query.month ?? now.getUTCMonth() + 1);

  const months = await prisma.paymentMonth.findMany({
    where: { billingYear: year, billingMonth: month },
    include: {
      student: { select: { id: true, fullName: true, phone: true } },
      course: { select: { id: true, name: true } },
      group: { select: { id: true, name: true } },
    },
  });

  const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const endOfMonth = new Date(Date.UTC(year, month, 1));
  const transactions = await prisma.payment.findMany({
    where: {
      paymentDate: { gte: startOfMonth, lt: endOfMonth },
      status: { notIn: [PaymentStatus.CANCELLED, PaymentStatus.REFUNDED] },
    },
  });

  const byMethod: Record<string, number> = {};
  for (const t of transactions) {
    byMethod[t.paymentMethod] = (byMethod[t.paymentMethod] ?? 0) + Number(t.amount);
  }

  return {
    year,
    month,
    expectedTotal: months.reduce((a, m) => a + Number(m.expectedAmount), 0),
    collectedTotal: months.reduce((a, m) => a + Number(m.paidAmount), 0),
    debtTotal: months.reduce((a, m) => a + Number(m.remainingDebt), 0),
    counts: {
      total: months.length,
      paid: months.filter((m) => m.status === PaymentStatus.PAID).length,
      partiallyPaid: months.filter((m) => m.status === PaymentStatus.PARTIALLY_PAID).length,
      unpaid: months.filter((m) => m.status === PaymentStatus.UNPAID).length,
      overdue: months.filter((m) => m.status === PaymentStatus.OVERDUE).length,
    },
    byMethod,
    items: months,
  };
}

export async function cancelOrRefundPayment(
  paymentId: string,
  action: 'CANCEL' | 'REFUND',
  reason: string,
  actorId: string,
  req: Request,
) {
  const existing = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!existing) throw new NotFoundError('To‘lov topilmadi');

  if (existing.status === PaymentStatus.CANCELLED || existing.status === PaymentStatus.REFUNDED) {
    throw new ValidationError('Ushbu to‘lov allaqachon bekor qilingan yoki qaytarilgan');
  }

  const targetStatus = action === 'CANCEL' ? PaymentStatus.CANCELLED : PaymentStatus.REFUNDED;

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: targetStatus,
        cancelledAt: action === 'CANCEL' ? new Date() : null,
        refundedAt: action === 'REFUND' ? new Date() : null,
        actionReason: reason,
      },
    });
    await recalculatePaymentMonth(tx, existing.paymentMonthId);
    return p;
  });

  await recordAuditLog({
    userId: actorId,
    action: action === 'CANCEL' ? 'PAYMENT_CANCEL' : 'PAYMENT_REFUND',
    entity: 'payments',
    entityId: paymentId,
    oldValues: existing,
    newValues: updated,
    req,
  });

  return updated;
}

export async function getReceiptData(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      student: true,
      cashier: { select: { id: true, fullName: true } },
      paymentMonth: {
        include: {
          course: true,
          group: true,
        },
      },
    },
  });
  if (!payment) throw new NotFoundError('Chek topilmadi');
  const setting = await prisma.setting.findFirst();

  return {
    centerName: setting?.centerName ?? 'EduManager IT Academy',
    centerPhone: setting?.centerPhone ?? '',
    centerAddress: setting?.centerAddress ?? '',
    receiptNumber: payment.receiptNumber,
    paymentDate: payment.paymentDate,
    studentName: payment.student.fullName,
    studentPhone: payment.student.phone,
    courseName: payment.paymentMonth.course.name,
    groupName: payment.paymentMonth.group.name,
    billingPeriod: `${payment.paymentMonth.billingYear}-${String(payment.paymentMonth.billingMonth).padStart(2, '0')}`,
    amount: Number(payment.amount),
    remainingDebt: Number(payment.paymentMonth.remainingDebt),
    paymentMethod: payment.paymentMethod,
    paymentType: payment.paymentType,
    status: payment.status,
    cashierName: payment.cashier?.fullName ?? 'Tizim',
    currency: setting?.currency ?? 'UZS',
  };
}

export async function buildReceiptPdf(paymentId: string): Promise<Buffer> {
  const receipt = await getReceiptData(paymentId);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [340, 480], margin: 24 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(15).fillColor('#1E3A8A').text(receipt.centerName, { align: 'center' });
    if (receipt.centerPhone) doc.fontSize(8).fillColor('#4B5563').text(receipt.centerPhone, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#111827').text("TO'LOV CHEKI", { align: 'center' });
    doc.fontSize(9).fillColor('#6B7280').text(`Chek #: ${receipt.receiptNumber}`, { align: 'center' });
    doc.moveDown(0.8);

    doc.moveTo(24, doc.y).lineTo(316, doc.y).strokeColor('#E5E7EB').stroke();
    doc.moveDown(0.6);

    const rows: Array<[string, string]> = [
      ["O'quvchi:", receipt.studentName],
      ['Telefon:', receipt.studentPhone],
      ['Kurs:', receipt.courseName],
      ['Guruh:', receipt.groupName],
      ['To‘lov oyi:', receipt.billingPeriod],
      ['To‘lov sanasi:', new Date(receipt.paymentDate).toISOString().slice(0, 16).replace('T', ' ')],
      ['Usul:', receipt.paymentMethod],
      ["To'langan summa:", `${receipt.amount.toLocaleString('en-US')} ${receipt.currency}`],
      ['Qolgan qarz:', `${receipt.remainingDebt.toLocaleString('en-US')} ${receipt.currency}`],
      ['Holat:', receipt.status],
      ['Kassir:', receipt.cashierName],
    ];

    for (const [label, value] of rows) {
      doc.fontSize(9).fillColor('#6B7280').text(label, { continued: true });
      doc.fillColor('#111827').text(`  ${value}`, { align: 'right' });
      doc.moveDown(0.3);
    }

    doc.moveDown(0.8);
    doc.moveTo(24, doc.y).lineTo(316, doc.y).strokeColor('#E5E7EB').stroke();
    doc.moveDown(0.8);
    doc.fontSize(8).fillColor('#6B7280').text("EduManager tizimi orqali tasdiqlangan", { align: 'center' });

    doc.end();
  });
}
