import { EnrollmentStatus, PaymentStatus, RoleName, StudentCourseStatus, StudentStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import { Request } from 'express';
import PDFDocument from 'pdfkit';
import { prisma } from '../../config/prisma.js';
import { recordAuditLog } from '../../utils/audit.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';
import { paginatedResponse, parsePagination } from '../../utils/pagination.js';
import { syncStudentPaymentMonths } from '../payments/payments.billing.js';

function buildStudentWhere(query: Record<string, unknown>) {
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const nameFilter = typeof query.name === 'string' ? query.name.trim() : '';
  const groupId = typeof query.groupId === 'string' ? query.groupId : undefined;
  const status = typeof query.status === 'string' ? (query.status as StudentStatus) : undefined;
  const debtorsOnly = query.debtorsOnly === 'true' || query.debtorsOnly === true;

  return {
    ...(status ? { status } : {}),
    ...(groupId
      ? {
          groupStudents: {
            some: { groupId, status: EnrollmentStatus.ACTIVE },
          },
        }
      : {}),
    ...(debtorsOnly
      ? {
          paymentMonths: {
            some: {
              remainingDebt: { gt: 0 },
              status: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIALLY_PAID, PaymentStatus.OVERDUE] },
            },
          },
        }
      : {}),
    ...(nameFilter ? { fullName: { contains: nameFilter, mode: 'insensitive' as const } } : {}),
    ...(search
      ? {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
            { parentPhone: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
}

export async function listStudents(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query, 20);
  const sortOrder = query.sort === 'name_asc' ? { fullName: 'asc' as const } : { createdAt: 'desc' as const };
  const where = buildStudentWhere(query);

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      skip,
      take: limit,
      orderBy: sortOrder,
      include: {
        groupStudents: {
          where: { status: EnrollmentStatus.ACTIVE },
          include: {
            group: { include: { course: { select: { id: true, name: true, monthlyPrice: true } } } },
          },
        },
        faceProfile: {
          select: { id: true, angleCount: true, modelVersion: true, updatedAt: true },
        },
        paymentMonths: {
          where: {
            remainingDebt: { gt: 0 },
            status: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIALLY_PAID, PaymentStatus.OVERDUE] },
          },
          select: { remainingDebt: true, status: true },
        },
      },
    }),
    prisma.student.count({ where }),
  ]);

  const enriched = students.map((s) => {
    const totalDebt = s.paymentMonths.reduce((sum, pm) => sum + Number(pm.remainingDebt), 0);
    return {
      ...s,
      monthlyFee: Number(s.monthlyFee),
      totalDebt,
      unpaidMonthsCount: s.paymentMonths.length,
      hasFaceId: Boolean(s.faceProfile),
    };
  });

  return paginatedResponse(enriched, total, page, limit);
}

export async function getStudentById(id: string) {
  await syncStudentPaymentMonths(id);

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      groupStudents: {
        orderBy: { joinedAt: 'desc' },
        include: {
          group: {
            include: {
              course: true,
              teacher: { include: { user: { select: { fullName: true, phone: true } } } },
            },
          },
        },
      },
      studentCourses: {
        include: { course: true },
        orderBy: { enrolledAt: 'desc' },
      },
      paymentMonths: {
        include: {
          course: { select: { id: true, name: true } },
          group: { select: { id: true, name: true } },
          payments: { orderBy: { paymentDate: 'desc' } },
        },
        orderBy: [{ billingYear: 'desc' }, { billingMonth: 'desc' }],
      },
      payments: {
        orderBy: { paymentDate: 'desc' },
        include: {
          cashier: { select: { id: true, fullName: true } },
          paymentMonth: { select: { billingYear: true, billingMonth: true, course: { select: { name: true } } } },
        },
      },
      attendances: {
        orderBy: { attendanceDate: 'desc' },
        take: 60,
        include: {
          group: { select: { id: true, name: true } },
        },
      },
      certificates: {
        orderBy: { issuedDate: 'desc' },
        include: { course: { select: { id: true, name: true } } },
      },
      faceProfile: {
        select: {
          id: true,
          embeddingDimension: true,
          modelVersion: true,
          angleCount: true,
          livenessVerified: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!student) throw new NotFoundError('O‘quvchi topilmadi');

  const debtMonths = student.paymentMonths.filter(
    (pm) =>
      Number(pm.remainingDebt) > 0 &&
      pm.status !== PaymentStatus.CANCELLED &&
      pm.status !== PaymentStatus.REFUNDED,
  );
  const totalDebt = debtMonths.reduce((sum, pm) => sum + Number(pm.remainingDebt), 0);
  const totalPaid = student.payments
    .filter((p) => p.status !== PaymentStatus.CANCELLED && p.status !== PaymentStatus.REFUNDED)
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return {
    ...student,
    monthlyFee: Number(student.monthlyFee),
    debtsSummary: {
      totalDebt,
      unpaidMonthsCount: debtMonths.length,
      debtMonths,
    },
    totalPaid,
    faceIdStatus: student.faceProfile
      ? {
          registered: true,
          ...student.faceProfile,
        }
      : {
          registered: false,
        },
  };
}

export async function createStudent(
  input: {
    fullName: string;
    phone: string;
    birthDate?: Date | null;
    gender: 'MALE' | 'FEMALE';
    address?: string | null;
    parentPhone?: string | null;
    enrolledAt?: Date;
    monthlyFee: number;
    status: StudentStatus;
    notes?: string | null;
    groupIds?: string[];
    createUserAccount?: boolean;
    password?: string;
  },
  actorId: string,
  req: Request,
) {
  const existing = await prisma.student.findUnique({ where: { phone: input.phone.trim() } });
  if (existing) throw new ConflictError('Bu telefon raqami bilan o‘quvchi allaqachon ro‘yxatga olingan');

  const student = await prisma.$transaction(async (tx) => {
    let userId: string | null = null;
    if (input.createUserAccount) {
      const studentRole = await tx.role.findUnique({ where: { name: RoleName.STUDENT } });
      if (studentRole) {
        const existingUser = await tx.user.findUnique({ where: { phone: input.phone.trim() } });
        if (!existingUser) {
          const passwordHash = await bcrypt.hash(input.password ?? 'EduManager2026!', 10);
          const createdUser = await tx.user.create({
            data: {
              roleId: studentRole.id,
              fullName: input.fullName,
              phone: input.phone.trim(),
              passwordHash,
            },
          });
          userId = createdUser.id;
        } else {
          userId = existingUser.id;
        }
      }
    }

    const created = await tx.student.create({
      data: {
        userId,
        fullName: input.fullName,
        phone: input.phone.trim(),
        birthDate: input.birthDate ?? null,
        gender: input.gender,
        address: input.address ?? null,
        parentPhone: input.parentPhone ?? null,
        enrolledAt: input.enrolledAt ?? new Date(),
        monthlyFee: input.monthlyFee,
        status: input.status,
        notes: input.notes ?? null,
      },
    });

    if (input.groupIds && input.groupIds.length > 0) {
      const groups = await tx.group.findMany({
        where: { id: { in: input.groupIds } },
        include: { course: true },
      });

      for (const g of groups) {
        const fee = input.monthlyFee > 0 ? input.monthlyFee : Number(g.course.monthlyPrice);
        await tx.groupStudent.create({
          data: {
            groupId: g.id,
            studentId: created.id,
            joinedAt: input.enrolledAt ?? new Date(),
            customMonthlyFee: fee,
            status: EnrollmentStatus.ACTIVE,
          },
        });
        await tx.studentCourse.upsert({
          where: { studentId_courseId: { studentId: created.id, courseId: g.courseId } },
          update: {},
          create: {
            studentId: created.id,
            courseId: g.courseId,
            enrolledAt: input.enrolledAt ?? new Date(),
            monthlyFee: fee,
            status: StudentCourseStatus.ENROLLED,
          },
        });
      }
    }

    return created;
  });

  await syncStudentPaymentMonths(student.id);

  await recordAuditLog({
    userId: actorId,
    action: 'STUDENT_CREATE',
    entity: 'students',
    entityId: student.id,
    newValues: student,
    req,
  });

  return getStudentById(student.id);
}

export async function updateStudent(
  id: string,
  data: Record<string, unknown>,
  actorId: string,
  req: Request,
) {
  const existing = await prisma.student.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('O‘quvchi topilmadi');

  const updated = await prisma.student.update({
    where: { id },
    data: data as never,
  });

  await recordAuditLog({
    userId: actorId,
    action: 'STUDENT_UPDATE',
    entity: 'students',
    entityId: id,
    oldValues: existing,
    newValues: updated,
    req,
  });

  return updated;
}

export async function deleteStudent(id: string, actorId: string, req: Request) {
  const existing = await prisma.student.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('O‘quvchi topilmadi');

  await prisma.student.delete({ where: { id } });

  await recordAuditLog({
    userId: actorId,
    action: 'STUDENT_DELETE',
    entity: 'students',
    entityId: id,
    oldValues: existing,
    req,
  });
}

export async function exportStudentsExcel(query: Record<string, unknown>): Promise<Buffer> {
  const where = buildStudentWhere(query);
  const students = await prisma.student.findMany({
    where,
    orderBy: { fullName: 'asc' },
    include: {
      groupStudents: {
        where: { status: EnrollmentStatus.ACTIVE },
        include: { group: { include: { course: true } } },
      },
      faceProfile: { select: { id: true } },
      paymentMonths: {
        where: {
          remainingDebt: { gt: 0 },
          status: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIALLY_PAID, PaymentStatus.OVERDUE] },
        },
        select: { remainingDebt: true },
      },
    },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Oquvchilar');

  sheet.columns = [
    { header: 'ID', key: 'id', width: 38 },
    { header: 'F.I.SH', key: 'fullName', width: 28 },
    { header: 'Telefon', key: 'phone', width: 18 },
    { header: 'Ota-ona telefoni', key: 'parentPhone', width: 18 },
    { header: 'Guruhlar', key: 'groups', width: 28 },
    { header: 'Oylik to‘lov (UZS)', key: 'monthlyFee', width: 18 },
    { header: 'Qarzdorlik (UZS)', key: 'debt', width: 18 },
    { header: 'Face ID', key: 'faceId', width: 12 },
    { header: 'Status', key: 'status', width: 14 },
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E40AF' },
  };

  for (const s of students) {
    const debt = s.paymentMonths.reduce((acc, pm) => acc + Number(pm.remainingDebt), 0);
    sheet.addRow({
      id: s.id,
      fullName: s.fullName,
      phone: s.phone,
      parentPhone: s.parentPhone ?? '-',
      groups: s.groupStudents.map((gs) => `${gs.group.name} (${gs.group.course.name})`).join(', ') || '-',
      monthlyFee: Number(s.monthlyFee),
      debt,
      faceId: s.faceProfile ? 'Ha' : 'Yo‘q',
      status: s.status,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function exportStudentsPdf(query: Record<string, unknown>): Promise<Buffer> {
  const where = buildStudentWhere(query);
  const students = await prisma.student.findMany({
    where,
    orderBy: { fullName: 'asc' },
    include: {
      groupStudents: {
        where: { status: EnrollmentStatus.ACTIVE },
        include: { group: true },
      },
      paymentMonths: {
        where: {
          remainingDebt: { gt: 0 },
          status: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIALLY_PAID, PaymentStatus.OVERDUE] },
        },
        select: { remainingDebt: true },
      },
    },
  });

  const setting = await prisma.setting.findFirst();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).fillColor('#1E3A8A').text(setting?.centerName ?? 'EduManager', { align: 'left' });
    doc.fontSize(13).fillColor('#111827').text("O'quvchilar ro'yxati hisoboti");
    doc.fontSize(9).fillColor('#6B7280').text(`Sana: ${new Date().toISOString().slice(0, 10)} | Jami: ${students.length}`);
    doc.moveDown(1);

    students.forEach((s, index) => {
      const debt = s.paymentMonths.reduce((acc, pm) => acc + Number(pm.remainingDebt), 0);
      const groups = s.groupStudents.map((gs) => gs.group.name).join(', ') || '-';
      doc
        .fontSize(10)
        .fillColor('#111827')
        .text(`${index + 1}. ${s.fullName} | ${s.phone} | Guruh: ${groups} | Qarz: ${debt.toLocaleString('en-US')} UZS | ${s.status}`);
      doc.moveDown(0.35);
    });

    doc.end();
  });
}
