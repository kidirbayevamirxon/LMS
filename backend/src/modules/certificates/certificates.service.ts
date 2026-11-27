import { CertificateStatus, NotificationType } from '@prisma/client';
import { Request } from 'express';
import fs from 'fs';
import path from 'path';
import { PDFDocument as PdfLibDocument, StandardFonts, rgb } from 'pdf-lib';
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

function formatCertificateDate(d: Date): string {
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const date = new Date(d);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

function normalizeWinAnsi(text: string): string {
  return text
    .replace(/[‘’`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/«/g, '<<')
    .replace(/»/g, '>>')
    .replace(/–|—/g, '-');
}

function wrapTextLines(
  text: string,
  font: Awaited<ReturnType<PdfLibDocument['embedFont']>>,
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function buildCertificatePdf(id: string): Promise<Buffer> {
  const cert = await getCertificateById(id);
  const qrBuffer = await QRCode.toBuffer(cert.qrCodeData, {
    width: 240,
    margin: 1,
    color: { dark: '#000000', light: '#FFFFFF' },
  });

  const candidatePaths = [
    path.resolve(process.cwd(), 'assets/certificate-template.pdf'),
    path.resolve(__dirname, '../../../assets/certificate-template.pdf'),
  ];
  const templatePath = candidatePaths.find((p) => fs.existsSync(p));
  if (!templatePath) {
    throw new NotFoundError('Sertifikat PDF shabloni topilmadi');
  }

  const templateBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PdfLibDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];
  const { width } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.06, 0.09, 0.16);
  const red = rgb(0.86, 0.15, 0.15);

  // 1. Student Full Name centered above the horizontal line (y ≈ 312)
  const studentName = normalizeWinAnsi(cert.studentFullName);
  let nameSize = 31;
  while (nameSize > 18 && fontRegular.widthOfTextAtSize(studentName, nameSize) > width - 280) {
    nameSize -= 1;
  }
  const nameWidth = fontRegular.widthOfTextAtSize(studentName, nameSize);
  page.drawText(studentName, {
    x: (width - nameWidth) / 2,
    y: 325,
    size: nameSize,
    font: fontRegular,
    color: black,
  });

  // 2. Course Name & Score centered below the horizontal line
  const courseText = normalizeWinAnsi(
    `<<"${cert.courseName}" kursini ${cert.resultScore} natija bilan muvaffaqiyatli yakunladi>>`,
  );
  const courseLines = wrapTextLines(courseText, fontBold, 12.5, width - 310);
  courseLines.slice(0, 3).forEach((line, idx) => {
    const lw = fontBold.widthOfTextAtSize(line, 12.5);
    page.drawText(line, {
      x: (width - lw) / 2,
      y: 284 - idx * 17,
      size: 12.5,
      font: fontBold,
      color: black,
    });
  });

  // 3. Date Range
  const dateRange = normalizeWinAnsi(
    `${formatCertificateDate(cert.courseStartDate)} - ${formatCertificateDate(cert.courseEndDate)}`,
  );
  const dateWidth = fontBold.widthOfTextAtSize(dateRange, 12.5);
  page.drawText(dateRange, {
    x: (width - dateWidth) / 2,
    y: 215,
    size: 12.5,
    font: fontBold,
    color: black,
  });

  // Optional Revoked watermark
  if (cert.status === CertificateStatus.REVOKED) {
    const revokedText = 'BEKOR QILINGAN / REVOKED';
    const rw = fontBold.widthOfTextAtSize(revokedText, 18);
    page.drawText(revokedText, {
      x: (width - rw) / 2,
      y: 185,
      size: 18,
      font: fontBold,
      color: red,
    });
  }

  // 4. QR Code to the right of the blue stamp
  const qrImage = await pdfDoc.embedPng(qrBuffer);
  page.drawImage(qrImage, {
    x: 504,
    y: 108,
    width: 74,
    height: 74,
  });

  // 5. Certificate ID centered below director name
  const idText = normalizeWinAnsi(`ID:${cert.certificateNumber}`);
  const idWidth = fontBold.widthOfTextAtSize(idText, 11.5);
  const idX = (width - idWidth) / 2;
  page.drawText(idText, {
    x: idX,
    y: 50,
    size: 11.5,
    font: fontBold,
    color: black,
  });
  page.drawLine({
    start: { x: idX, y: 48 },
    end: { x: idX + idWidth, y: 48 },
    thickness: 1,
    color: black,
  });

  const outBytes = await pdfDoc.save();
  return Buffer.from(outBytes);
}
