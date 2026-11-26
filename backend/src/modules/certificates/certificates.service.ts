import { CertificateStatus, NotificationType } from '@prisma/client';
import { Request } from 'express';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { recordAuditLog } from '../../utils/audit.js';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { paginatedResponse, parsePagination } from '../../utils/pagination.js';
import { createAndDispatchNotification } from '../notifications/notifications.service.js';

async function generateCertificateNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const count = await prisma.certificate.count();
  return `CERT-${year}-${String(count + 1).padStart(6, '0')}`;
}

export async function generateCertificate(
  input: {
    studentId: string;
    courseId: string;
    groupId?: string | null;
    resultScore?: string;
    status?: CertificateStatus;
  },
  actorId: string,
  req: Request,
) {
  const [student, course, setting] = await Promise.all([
    prisma.student.findUnique({ where: { id: input.studentId } }),
    prisma.course.findUnique({ where: { id: input.courseId } }),
    prisma.setting.findFirst(),
  ]);

  if (!student) throw new NotFoundError('O‘quvchi topilmadi');
  if (!course) throw new NotFoundError('Kurs topilmadi');
  if (!course.hasCertificate) {
    throw new ValidationError('Ushbu kurs uchun sertifikat ko‘zda tutilmagan');
  }

  const existing = await prisma.certificate.findUnique({
    where: { studentId_courseId: { studentId: student.id, courseId: course.id } },
  });
  if (existing) {
    throw new ConflictError('Bu o‘quvchiga ushbu kurs uchun sertifikat allaqachon berilgan');
  }

  const group = input.groupId
    ? await prisma.group.findUnique({ where: { id: input.groupId } })
    : await prisma.group.findFirst({
        where: {
          courseId: course.id,
          groupStudents: { some: { studentId: student.id } },
        },
        orderBy: { startDate: 'desc' },
      });

  const sc = await prisma.studentCourse.findUnique({
    where: { studentId_courseId: { studentId: student.id, courseId: course.id } },
  });

  const certNumber = await generateCertificateNumber();
  const verifyUrl = `${env.APP_PUBLIC_URL.replace(/\/$/, '')}/certificate/verify/${certNumber}`;
  const scoreDisplay =
    input.resultScore ??
    (sc?.resultScore ? `${Number(sc.resultScore)}% (${sc.resultGrade ?? 'Pass'})` : 'Muvaffaqiyatli yakunladi');

  const certificate = await prisma.certificate.create({
    data: {
      certificateNumber: certNumber,
      studentId: student.id,
      courseId: course.id,
      groupId: group?.id ?? null,
      studentFullName: student.fullName,
      courseName: course.name,
      centerName: setting?.centerName ?? 'EduManager IT Academy',
      courseStartDate: group?.startDate ?? sc?.enrolledAt ?? student.enrolledAt,
      courseEndDate: group?.endDate ?? sc?.completedAt ?? new Date(),
      issuedDate: new Date(),
      resultScore: scoreDisplay,
      qrCodeData: verifyUrl,
      signatureUrl: setting?.directorSignatureUrl ?? null,
      logoUrl: setting?.centerLogoUrl ?? null,
      status: input.status ?? CertificateStatus.ISSUED,
      issuedById: actorId,
    },
    include: {
      student: { select: { id: true, fullName: true, phone: true } },
      course: { select: { id: true, name: true } },
    },
  });

  await recordAuditLog({
    userId: actorId,
    action: 'CERTIFICATE_GENERATE',
    entity: 'certificates',
    entityId: certificate.id,
    newValues: certificate,
    req,
  });

  if (certificate.status === CertificateStatus.ISSUED) {
    await createAndDispatchNotification({
      userId: student.userId,
      studentId: student.id,
      type: NotificationType.CERTIFICATE_READY,
      title: 'Sertifikatingiz tayyor!',
      body: `${course.name} kursi bo‘yicha ${certNumber} raqamli sertifikat rasmiylashtirildi.`,
      data: { certificateId: certificate.id, certificateNumber: certNumber },
    });
  }

  return certificate;
}

export async function listCertificates(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query, 20);
  const studentId = typeof query.studentId === 'string' ? query.studentId : undefined;
  const courseId = typeof query.courseId === 'string' ? query.courseId : undefined;
  const status = typeof query.status === 'string' ? (query.status as CertificateStatus) : undefined;
  const search = typeof query.search === 'string' ? query.search.trim() : '';

  const where = {
    ...(studentId ? { studentId } : {}),
    ...(courseId ? { courseId } : {}),
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { certificateNumber: { contains: search, mode: 'insensitive' as const } },
            { studentFullName: { contains: search, mode: 'insensitive' as const } },
            { courseName: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.certificate.findMany({
      where,
      skip,
      take: limit,
      orderBy: { issuedDate: 'desc' },
      include: {
        student: { select: { id: true, fullName: true, phone: true } },
        course: { select: { id: true, name: true } },
        group: { select: { id: true, name: true } },
      },
    }),
    prisma.certificate.count({ where }),
  ]);

  return paginatedResponse(items, total, page, limit);
}

export async function getCertificateById(id: string) {
  const cert = await prisma.certificate.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, fullName: true, phone: true } },
      course: true,
      group: true,
    },
  });
  if (!cert) throw new NotFoundError('Sertifikat topilmadi');
  return cert;
}

export async function verifyCertificateByNumber(certificateNumber: string) {
  const cert = await prisma.certificate.findUnique({
    where: { certificateNumber },
    include: {
      course: { select: { name: true, durationMonths: true } },
    },
  });
  if (!cert) {
    return {
      valid: false,
      status: 'NOT_FOUND',
      message: 'Bunday raqamli sertifikat topilmadi',
    };
  }
  return {
    valid: cert.status === CertificateStatus.ISSUED,
    status: cert.status,
    certificate: {
      certificateNumber: cert.certificateNumber,
      studentFullName: cert.studentFullName,
      courseName: cert.courseName,
      centerName: cert.centerName,
      courseStartDate: cert.courseStartDate,
      courseEndDate: cert.courseEndDate,
      issuedDate: cert.issuedDate,
      resultScore: cert.resultScore,
      status: cert.status,
      revokedAt: cert.revokedAt,
      revokeReason: cert.revokeReason,
    },
  };
}

export async function updateCertificateStatus(
  id: string,
  status: CertificateStatus,
  revokeReason: string | undefined,
  actorId: string,
  req: Request,
) {
  const existing = await prisma.certificate.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Sertifikat topilmadi');

  const updated = await prisma.certificate.update({
    where: { id },
    data: {
      status,
      revokedAt: status === CertificateStatus.REVOKED ? new Date() : null,
      revokeReason: status === CertificateStatus.REVOKED ? revokeReason ?? 'Bekor qilindi' : null,
    },
  });

  await recordAuditLog({
    userId: actorId,
    action: 'CERTIFICATE_STATUS_UPDATE',
    entity: 'certificates',
    entityId: id,
    oldValues: { status: existing.status },
    newValues: { status: updated.status, revokeReason },
    req,
  });

  return updated;
}

export async function buildCertificatePdf(id: string): Promise<Buffer> {
  const cert = await getCertificateById(id);
  const setting = await prisma.setting.findFirst();
  const qrBuffer = await QRCode.toBuffer(cert.qrCodeData, {
    width: 140,
    margin: 1,
    color: { dark: '#0F172A', light: '#FFFFFF' },
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const w = doc.page.width;
    const h = doc.page.height;

    // Background & double ornamental frame
    doc.rect(0, 0, w, h).fill('#FFFDF8');
    doc.lineWidth(4).strokeColor('#1E3A8A').rect(24, 24, w - 48, h - 48).stroke();
    doc.lineWidth(1.5).strokeColor('#D97706').rect(34, 34, w - 68, h - 68).stroke();

    // Header badge
    doc.fontSize(13).fillColor('#D97706').text(cert.centerName.toUpperCase(), 0, 62, {
      align: 'center',
      characterSpacing: 2,
    });

    doc.fontSize(38).fillColor('#1E3A8A').text('SERTIFIKAT', 0, 96, {
      align: 'center',
      characterSpacing: 5,
    });
    doc.fontSize(11).fillColor('#475569').text('CERTIFICATE OF COMPLETION', 0, 142, {
      align: 'center',
      characterSpacing: 2,
    });

    doc.fontSize(13).fillColor('#334155').text('Ushbu sertifikat quyidagi o‘quvchiga taqdim etiladi:', 0, 184, {
      align: 'center',
    });

    // Student name
    doc.fontSize(30).fillColor('#0F172A').text(cert.studentFullName, 60, 218, {
      align: 'center',
      width: w - 120,
    });

    doc
      .moveTo(w / 2 - 180, 258)
      .lineTo(w / 2 + 180, 258)
      .lineWidth(1)
      .strokeColor('#CBD5E1')
      .stroke();

    // Course details
    doc
      .fontSize(14)
      .fillColor('#334155')
      .text(
        `"${cert.courseName}" o‘quv kursini muvaffaqiyatli tamomlagani uchun`,
        80,
        276,
        { align: 'center', width: w - 160 },
      );

    doc
      .fontSize(12)
      .fillColor('#1E40AF')
      .text(`Natija / Ball: ${cert.resultScore}`, 80, 310, { align: 'center', width: w - 160 });

    const startStr = new Date(cert.courseStartDate).toISOString().slice(0, 10);
    const endStr = new Date(cert.courseEndDate).toISOString().slice(0, 10);
    const issuedStr = new Date(cert.issuedDate).toISOString().slice(0, 10);

    doc
      .fontSize(10)
      .fillColor('#64748B')
      .text(`Kurs muddati: ${startStr} — ${endStr}   |   Berilgan sana: ${issuedStr}`, 80, 342, {
        align: 'center',
        width: w - 160,
      });

    if (cert.status === CertificateStatus.REVOKED) {
      doc.fontSize(22).fillColor('#DC2626').text('BEKOR QILINGAN / REVOKED', 0, 370, { align: 'center' });
    }

    // Footer: Signature (left), Seal/Number (center), QR Code (right)
    doc.fontSize(11).fillColor('#0F172A').text(setting?.directorName ?? 'Markaz Direktori', 76, h - 118);
    doc.moveTo(76, h - 98).lineTo(256, h - 98).lineWidth(1).strokeColor('#475569').stroke();
    doc.fontSize(9).fillColor('#64748B').text('Direktor imzosi / Muhr', 76, h - 90);

    doc
      .fontSize(10)
      .fillColor('#1E3A8A')
      .text(`№ ${cert.certificateNumber}`, w / 2 - 100, h - 105, { width: 200, align: 'center' });
    doc
      .fontSize(8)
      .fillColor('#64748B')
      .text('Haqiqiyligini QR kod orqali tekshiring', w / 2 - 120, h - 88, { width: 240, align: 'center' });

    doc.image(qrBuffer, w - 166, h - 152, { width: 96, height: 96 });

    doc.end();
  });
}
