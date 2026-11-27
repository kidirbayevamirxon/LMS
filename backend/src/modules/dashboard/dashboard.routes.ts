import { AttendanceStatus, EnrollmentStatus, PaymentStatus, RoleName } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../config/prisma.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { toUtcDateOnly } from '../attendance/attendance.service.js';
import { runPeriodicNotificationChecks } from '../notifications/notifications.service.js';
import { syncStudentPaymentMonths } from '../payments/payments.billing.js';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

dashboardRouter.get('/', async (req, res, next) => {
  try {
    await syncStudentPaymentMonths();
    await runPeriodicNotificationChecks().catch(() => {});
    const now = new Date();
    const todayDate = toUtcDateOnly(now);
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    // If student role, return student-focused dashboard
    if (req.user!.role === RoleName.STUDENT) {
      const [student, setting] = await Promise.all([
        prisma.student.findUnique({
          where: { userId: req.user!.userId },
          include: {
            groupStudents: {
              where: { status: EnrollmentStatus.ACTIVE },
              include: {
                group: {
                  include: {
                    course: true,
                    teacher: { include: { user: { select: { fullName: true, phone: true } } } },
                  },
                },
              },
            },
            paymentMonths: {
              orderBy: [{ billingYear: 'desc' }, { billingMonth: 'desc' }],
              include: { course: { select: { name: true } } },
            },
            attendances: { orderBy: { attendanceDate: 'desc' }, take: 20 },
            certificates: true,
          },
        }),
        prisma.setting.findFirst({ select: { paymentDueDay: true, centerName: true } }),
      ]);

      const notifications = student
        ? await prisma.notification.findMany({
            where: {
              OR: [{ userId: req.user!.userId }, { studentId: student.id }],
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          })
        : [];

      res.json({
        success: true,
        data: {
          mode: 'STUDENT',
          student,
          paymentDueDay: setting?.paymentDueDay ?? 10,
          notifications,
        },
      });
      return;
    }

    const [
      totalStudents,
      activeStudents,
      totalGroups,
      totalCourses,
      todayAttendances,
      monthlyRevenueAgg,
      totalDebtAgg,
      certificatesCount,
      paymentMonthStatusCounts,
      groupsWithCounts,
      recentPayments,
    ] = await Promise.all([
      prisma.student.count(),
      prisma.student.count({ where: { status: 'ACTIVE' } }),
      prisma.group.count({ where: { status: 'ACTIVE' } }),
      prisma.course.count({ where: { status: 'ACTIVE' } }),
      prisma.attendance.findMany({
        where: { attendanceDate: todayDate },
        select: { status: true },
      }),
      prisma.payment.aggregate({
        where: {
          paymentDate: { gte: startOfMonth },
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
      prisma.certificate.count({ where: { status: 'ISSUED' } }),
      prisma.paymentMonth.groupBy({
        by: ['status'],
        _count: { id: true },
        _sum: { expectedAmount: true, paidAmount: true, remainingDebt: true },
      }),
      prisma.group.findMany({
        where: { status: 'ACTIVE' },
        include: {
          course: { select: { name: true } },
          _count: { select: { groupStudents: { where: { status: EnrollmentStatus.ACTIVE } } } },
        },
        take: 10,
      }),
      prisma.payment.findMany({
        take: 6,
        orderBy: { paymentDate: 'desc' },
        include: {
          student: { select: { fullName: true } },
          paymentMonth: { select: { billingYear: true, billingMonth: true } },
        },
      }),
    ]);

    const todayPresentCount = todayAttendances.filter(
      (a) => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.LATE,
    ).length;
    const todayAbsentCount = todayAttendances.filter((a) => a.status === AttendanceStatus.ABSENT).length;

    // Last 6 months revenue trend
    const monthlyRevenueChart: Array<{ label: string; revenue: number; year: number; month: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const nextD = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
      const agg = await prisma.payment.aggregate({
        where: {
          paymentDate: { gte: d, lt: nextD },
          status: { notIn: [PaymentStatus.CANCELLED, PaymentStatus.REFUNDED] },
        },
        _sum: { amount: true },
      });
      monthlyRevenueChart.push({
        label: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        revenue: Number(agg._sum.amount ?? 0),
      });
    }

    // Last 7 days attendance trend
    const attendanceChart: Array<{ date: string; present: number; late: number; absent: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayDate.getTime() - i * 24 * 60 * 60 * 1000);
      const dayRecords = await prisma.attendance.findMany({
        where: { attendanceDate: d },
        select: { status: true },
      });
      attendanceChart.push({
        date: d.toISOString().slice(5, 10),
        present: dayRecords.filter((r) => r.status === AttendanceStatus.PRESENT).length,
        late: dayRecords.filter((r) => r.status === AttendanceStatus.LATE).length,
        absent: dayRecords.filter((r) => r.status === AttendanceStatus.ABSENT).length,
      });
    }

    res.json({
      success: true,
      data: {
        mode: 'ADMIN',
        stats: {
          totalStudents,
          activeStudents,
          totalGroups,
          totalCourses,
          todayAttendance: todayPresentCount,
          todayAbsent: todayAbsentCount,
          monthlyRevenue: Number(monthlyRevenueAgg._sum.amount ?? 0),
          totalDebt: Number(totalDebtAgg._sum.remainingDebt ?? 0),
          certificatesIssued: certificatesCount,
        },
        charts: {
          monthlyRevenue: monthlyRevenueChart,
          paymentStats: paymentMonthStatusCounts.map((row) => ({
            status: row.status,
            count: row._count.id,
            paidAmount: Number(row._sum.paidAmount ?? 0),
            remainingDebt: Number(row._sum.remainingDebt ?? 0),
          })),
          attendanceStats: attendanceChart,
          studentsByGroup: groupsWithCounts.map((g) => ({
            id: g.id,
            name: g.name,
            courseName: g.course.name,
            studentsCount: g._count.groupStudents,
            maxStudents: g.maxStudents,
          })),
        },
        recentPayments,
      },
    });
  } catch (err) {
    next(err);
  }
});
