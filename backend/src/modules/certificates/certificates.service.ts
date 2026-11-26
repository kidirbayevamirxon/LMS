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

function drawLaurelBranch(doc: PDFKit.PDFDocument, baseX: number, baseY: number, dir: -1 | 1) {
  const gold = '#C69D47';
  const steps = 11;
  doc.save();
  doc.strokeColor(gold).lineWidth(1.8);
  doc.moveTo(baseX, baseY);
  const tipX = baseX + dir * 24;
  const tipY = baseY - 228;
  doc.bezierCurveTo(
    baseX - dir * 32,
    baseY - 75,
    baseX - dir * 16,
    baseY - 165,
    tipX,
    tipY,
  ).stroke();

  for (let i = 1; i <= steps; i++) {
    const t = i / (steps + 1);
    const inv = 1 - t;
    const cx =
      inv * inv * inv * baseX +
      3 * inv * inv * t * (baseX - dir * 32) +
      3 * inv * t * t * (baseX - dir * 16) +
      t * t * t * tipX;
    const cy =
      inv * inv * inv * baseY +
      3 * inv * inv * t * (baseY - 75) +
      3 * inv * t * t * (baseY - 165) +
      t * t * t * tipY;

    // Outer & inner leaf pair
    doc.save();
    doc.translate(cx - dir * 11, cy - 4);
    doc.rotate(dir * -32);
    doc.ellipse(0, 0, 12, 4.2).fill(gold);
    doc.restore();

    doc.save();
    doc.translate(cx + dir * 10, cy - 8);
    doc.rotate(dir * 38);
    doc.ellipse(0, 0, 11.5, 4).fill(gold);
    doc.restore();
  }

  // Tip leaf
  doc.save();
  doc.translate(tipX, tipY - 8);
  doc.rotate(dir * 12);
  doc.ellipse(0, 0, 11, 3.8).fill(gold);
  doc.restore();
  doc.restore();
}

export async function buildCertificatePdf(id: string): Promise<Buffer> {
  const cert = await getCertificateById(id);
  const setting = await prisma.setting.findFirst();
  const qrBuffer = await QRCode.toBuffer(cert.qrCodeData, {
    width: 160,
    margin: 1,
    color: { dark: '#0F172A', light: '#FFFFFF' },
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 24 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const w = doc.page.width;
    const h = doc.page.height;
    const gold = '#C69D47';
    const deepGold = '#9E7422';
    const espresso = '#1D1109';

    // Crisp white canvas
    doc.rect(0, 0, w, h).fill('#FFFFFF');

    // Top-left & Top-right 5 nested golden corner angles
    doc.save();
    doc.strokeColor(gold).lineWidth(2);
    for (let i = 0; i < 5; i++) {
      const offset = 18 + i * 10;
      const hLen = 158 - i * 24;
      const vLen = 138 - i * 20;
      // Top-left
      doc.moveTo(offset, offset + vLen).lineTo(offset, offset).lineTo(offset + hLen, offset).stroke();
      // Top-right
      doc.moveTo(w - offset, offset + vLen).lineTo(w - offset, offset).lineTo(w - offset - hLen, offset).stroke();
    }
    doc.restore();

    // Bottom-left ornamental espresso triangle + golden geometric lattice + gold diagonal ribbon
    const triW = w * 0.295;
    const triTopY = h * 0.49;

    const drawCornerTriangle = (isRight: boolean) => {
      doc.save();
      if (!isRight) {
        doc.moveTo(0, triTopY).lineTo(triW, h).lineTo(0, h).closePath().clip();
        doc.rect(0, triTopY, triW, h - triTopY).fill(espresso);
      } else {
        doc.moveTo(w, triTopY).lineTo(w - triW, h).lineTo(w, h).closePath().clip();
        doc.rect(w - triW, triTopY, triW, h - triTopY).fill(espresso);
      }

      // Golden geometric lattice inside clipped corner
      doc.strokeColor('#C29843').strokeOpacity(0.36).lineWidth(0.8);
      const startX = isRight ? w - triW - 20 : -20;
      const endX = isRight ? w + 20 : triW + 20;
      for (let gx = startX; gx <= endX; gx += 24) {
        for (let gy = triTopY - 20; gy <= h + 20; gy += 24) {
          doc.moveTo(gx, gy - 12).lineTo(gx + 12, gy).lineTo(gx, gy + 12).lineTo(gx - 12, gy).closePath().stroke();
          doc.circle(gx, gy, 3.5).stroke();
        }
      }
      doc.restore();

      // Diagonal golden ribbon edge
      doc.save();
      const x1 = isRight ? w : 0;
      const x2 = isRight ? w - triW : triW;
      doc.strokeColor('#C8A045').lineWidth(9).moveTo(x1, triTopY).lineTo(x2, h).stroke();
      doc.strokeColor('#E6C473').lineWidth(2.5).moveTo(x1, triTopY + 3).lineTo(x2 - (isRight ? -3 : 3), h).stroke();
      doc.restore();
    };

    drawCornerTriangle(false);
    drawCornerTriangle(true);

    // Left & Right golden laurel branches
    drawLaurelBranch(doc, 118, 388, -1);
    drawLaurelBranch(doc, w - 118, 388, 1);

    // Top geometric center emblem + organization subtitle
    doc.save();
    doc.fillColor('#1E40AF').circle(w / 2 - 74, 48, 9).fill();
    doc.fillColor('#16A34A').circle(w / 2 + 74, 48, 9).fill();
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor('#334155')
      .text('EDUMANAGER • EDUCATION PLATFORM', w / 2 - 140, 44, { width: 280, align: 'center' });
    doc.restore();

    // Main Certificate Typography
    doc
      .font('Times-Bold')
      .fontSize(38)
      .fillColor(deepGold)
      .text('CERTIFICATE', 60, 88, { width: w - 120, align: 'center', characterSpacing: 7 });

    doc
      .font('Times-Roman')
      .fontSize(16)
      .fillColor(deepGold)
      .text('OF COMPLETION', 60, 138, { width: w - 120, align: 'center', characterSpacing: 4.5 });

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#8B6316')
      .text(cert.centerName.toUpperCase(), 60, 166, {
        width: w - 120,
        align: 'center',
        characterSpacing: 1.5,
      });

    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor('#1E293B')
      .text('This Certificate has been awarded to', 80, 206, { width: w - 160, align: 'center' });

    doc
      .font('Helvetica-Bold')
      .fontSize(30)
      .fillColor('#0F172A')
      .text(cert.studentFullName, 80, 228, { width: w - 160, align: 'center' });

    doc
      .save()
      .strokeColor('#0F172A')
      .lineWidth(1.6)
      .moveTo(w / 2 - 195, 268)
      .lineTo(w / 2 + 195, 268)
      .stroke()
      .restore();

    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#0F172A')
      .text(
        `«"${cert.courseName}" kursini ${cert.resultScore} natija bilan muvaffaqiyatli yakunladi»`,
        140,
        286,
        { width: w - 280, align: 'center' },
      );

    const dateRange = `${formatCertificateDate(cert.courseStartDate)} - ${formatCertificateDate(cert.courseEndDate)}`;
    doc
      .font('Helvetica-Bold')
      .fontSize(11.5)
      .fillColor('#0F172A')
      .text(dateRange, 120, 336, { width: w - 240, align: 'center' });

    if (cert.status === CertificateStatus.REVOKED) {
      doc
        .font('Helvetica-Bold')
        .fontSize(22)
        .fillColor('#DC2626')
        .text('BEKOR QILINGAN / REVOKED', 80, 362, { width: w - 160, align: 'center' });
    }

    // Footer: Signature (Left), Circular Blue Stamp + Director Name + ID (Center), QR Code (Right)
    const footerY = 432;

    // Stylized cursive signature on left
    doc.save();
    doc.strokeColor('#0F172A').lineWidth(1.6);
    const sigX = w / 2 - 165;
    const sigY = footerY + 6;
    doc
      .moveTo(sigX, sigY)
      .bezierCurveTo(sigX + 8, sigY - 26, sigX + 34, sigY - 26, sigX + 22, sigY + 6)
      .bezierCurveTo(sigX + 12, sigY + 20, sigX + 4, sigY + 12, sigX + 32, sigY - 2)
      .bezierCurveTo(sigX + 44, sigY - 12, sigX + 52, sigY + 8, sigX + 68, sigY - 4)
      .bezierCurveTo(sigX + 76, sigY - 10, sigX + 82, sigY + 10, sigX + 96, sigY - 10)
      .stroke();
    doc.restore();

    // Circular Blue Stamp in center
    const stampCx = w / 2;
    const stampCy = footerY;
    doc.save();
    doc.strokeColor('#1D4ED8').lineWidth(1.6).circle(stampCx, stampCy, 42).stroke();
    doc.strokeColor('#1D4ED8').lineWidth(0.9).circle(stampCx, stampCy, 38).stroke();
    doc.strokeColor('#1D4ED8').lineWidth(1.2).circle(stampCx, stampCy, 24).stroke();
    doc
      .font('Helvetica-Bold')
      .fontSize(7)
      .fillColor('#1D4ED8')
      .text(cert.centerName.toUpperCase().slice(0, 26), stampCx - 23, stampCy - 9, {
        width: 46,
        align: 'center',
      });
    doc
      .font('Helvetica-Bold')
      .fontSize(6)
      .fillColor('#1D4ED8')
      .text('★ VERIFIED ★', stampCx - 34, stampCy + 27, { width: 68, align: 'center' });
    doc.restore();

    // QR Code on right
    doc.image(qrBuffer, w / 2 + 82, footerY - 42, { width: 84, height: 84 });

    // Director name + Certificate ID centered below stamp
    const director = (setting?.directorName || 'MARKAZ DIREKTORI').toUpperCase();
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#0F172A')
      .text(director, w / 2 - 140, 492, { width: 280, align: 'center', underline: true });

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#0F172A')
      .text(`ID: ${cert.certificateNumber}`, w / 2 - 140, 512, {
        width: 280,
        align: 'center',
        underline: true,
      });

    doc.end();
  });
}
