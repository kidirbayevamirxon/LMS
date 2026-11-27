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
  const steps = 13;
  doc.save();
  doc.strokeColor(gold).lineWidth(1.6);
  doc.moveTo(baseX, baseY);
  const tipX = baseX + dir * 26;
  const tipY = baseY - 245;
  doc.bezierCurveTo(
    baseX - dir * 36,
    baseY - 82,
    baseX - dir * 18,
    baseY - 178,
    tipX,
    tipY,
  ).stroke();

  const drawLeaf = (lx: number, ly: number, angleDeg: number, len: number, wid: number) => {
    doc.save();
    doc.translate(lx, ly);
    doc.rotate(angleDeg);
    doc
      .moveTo(0, 0)
      .bezierCurveTo(len * 0.35, -wid, len * 0.75, -wid * 0.85, len, 0)
      .bezierCurveTo(len * 0.75, wid * 0.85, len * 0.35, wid, 0, 0)
      .fill(gold);
    doc.restore();
  };

  for (let i = 1; i <= steps; i++) {
    const t = i / (steps + 1);
    const inv = 1 - t;
    const cx =
      inv * inv * inv * baseX +
      3 * inv * inv * t * (baseX - dir * 36) +
      3 * inv * t * t * (baseX - dir * 18) +
      t * t * t * tipX;
    const cy =
      inv * inv * inv * baseY +
      3 * inv * inv * t * (baseY - 82) +
      3 * inv * t * t * (baseY - 178) +
      t * t * t * tipY;

    const scale = 1 - t * 0.25;
    drawLeaf(cx, cy, dir === -1 ? -135 : -45, 22 * scale, 5.2 * scale);
    drawLeaf(cx, cy - 3, dir === -1 ? -50 : -130, 20 * scale, 4.8 * scale);
  }

  // Tip leaf
  drawLeaf(tipX, tipY, dir === -1 ? -80 : -100, 20, 4.5);
  doc.restore();
}

function drawTopLogos(doc: PDFKit.PDFDocument, centerX: number) {
  // Left emblem: Ministry of Digital Technologies geometric star-cube
  const mX = centerX - 108;
  const mY = 44;
  doc.save();
  doc.fillColor('#1E4B9B');
  for (let i = 0; i < 8; i++) {
    doc.save();
    doc.translate(mX, mY);
    doc.rotate(i * 45);
    doc.moveTo(0, -16).lineTo(4.5, -5.5).lineTo(0, 0).lineTo(-4.5, -5.5).closePath().fill();
    doc.restore();
  }
  doc.fillColor('#FFFFFF').circle(mX, mY, 3.2).fill();
  doc
    .font('Helvetica')
    .fontSize(6.2)
    .fillColor('#1E4B9B')
    .text('MINISTRY OF DIGITAL\nTECHNOLOGIES OF THE\nREPUBLIC OF UZBEKISTAN', mX + 20, mY - 12, {
      width: 95,
      lineGap: 1.2,
    });
  doc.restore();

  // Right emblem: IT PARK
  const pX = centerX + 26;
  const pY = 44;
  doc.save();
  doc.fillColor('#76B82A').circle(pX, pY, 15).fill();
  // White stylized person inside green circle
  doc.fillColor('#FFFFFF').circle(pX, pY - 5, 3).fill();
  doc
    .strokeColor('#FFFFFF')
    .lineWidth(2.4)
    .lineCap('round')
    .moveTo(pX - 7, pY - 2)
    .quadraticCurveTo(pX, pY + 2, pX + 7, pY - 2)
    .stroke();
  doc.moveTo(pX, pY).lineTo(pX, pY + 10).stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor('#76B82A')
    .text('IT PARK', pX + 20, pY - 10);
  doc
    .font('Helvetica')
    .fontSize(5.5)
    .fillColor('#475569')
    .text('START local & GO global', pX + 20, pY + 5);
  doc.restore();
}

export async function buildCertificatePdf(id: string): Promise<Buffer> {
  const cert = await getCertificateById(id);
  const setting = await prisma.setting.findFirst();
  const qrBuffer = await QRCode.toBuffer(cert.qrCodeData, {
    width: 170,
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
    const deepGold = '#A67C2E';
    const espresso = '#1F1107';
    const darkEspresso = '#140903';

    // Crisp white canvas
    doc.rect(0, 0, w, h).fill('#FFFFFF');

    // Top-left & Top-right 5 nested golden corner angles
    doc.save();
    doc.strokeColor(gold).lineWidth(2.2);
    for (let i = 0; i < 5; i++) {
      const offset = 16 + i * 10.5;
      const hLen = 168 - i * 24;
      const vLen = 148 - i * 20;
      // Top-left
      doc.moveTo(offset, offset + vLen).lineTo(offset, offset).lineTo(offset + hLen, offset).stroke();
      // Top-right
      doc.moveTo(w - offset, offset + vLen).lineTo(w - offset, offset).lineTo(w - offset - hLen, offset).stroke();
    }
    doc.restore();

    // Bottom-left & Bottom-right 2-layer ornamental triangles + diagonal gold ribbons
    const triOuterW = w * 0.29;
    const triOuterTopY = h * 0.50;
    const triInnerW = w * 0.21;
    const triInnerTopY = h * 0.65;

    const drawCornerTriangle = (isRight: boolean) => {
      // 1. Outer patterned triangle
      doc.save();
      if (!isRight) {
        doc.moveTo(0, triOuterTopY).lineTo(triOuterW, h).lineTo(0, h).closePath().clip();
        doc.rect(0, triOuterTopY, triOuterW, h - triOuterTopY).fill(espresso);
      } else {
        doc.moveTo(w, triOuterTopY).lineTo(w - triOuterW, h).lineTo(w, h).closePath().clip();
        doc.rect(w - triOuterW, triOuterTopY, triOuterW, h - triOuterTopY).fill(espresso);
      }

      // Intricate golden Islamic geometric lattice inside outer triangle
      doc.strokeColor('#D4AA50').strokeOpacity(0.55).lineWidth(0.75);
      const startX = isRight ? w - triOuterW - 20 : -20;
      const endX = isRight ? w + 20 : triOuterW + 20;
      for (let gx = startX; gx <= endX; gx += 22) {
        for (let gy = triOuterTopY - 20; gy <= h + 20; gy += 22) {
          doc.moveTo(gx, gy - 11).lineTo(gx + 11, gy).lineTo(gx, gy + 11).lineTo(gx - 11, gy).closePath().stroke();
          doc.rect(gx - 7.5, gy - 7.5, 15, 15).stroke();
          doc.circle(gx, gy, 3).stroke();
        }
      }
      doc.restore();

      // Outer diagonal golden ribbon
      doc.save();
      const ox1 = isRight ? w : 0;
      const ox2 = isRight ? w - triOuterW : triOuterW;
      doc.strokeColor('#C8A045').lineWidth(8).moveTo(ox1, triOuterTopY).lineTo(ox2, h).stroke();
      doc.strokeColor('#EAD08A').lineWidth(2).moveTo(ox1, triOuterTopY + 1).lineTo(ox2, h + 1).stroke();
      doc.restore();

      // 2. Inner solid dark espresso triangle
      doc.save();
      if (!isRight) {
        doc.moveTo(0, triInnerTopY).lineTo(triInnerW, h).lineTo(0, h).closePath().fill(darkEspresso);
      } else {
        doc.moveTo(w, triInnerTopY).lineTo(w - triInnerW, h).lineTo(w, h).closePath().fill(darkEspresso);
      }
      const ix1 = isRight ? w : 0;
      const ix2 = isRight ? w - triInnerW : triInnerW;
      doc.strokeColor('#C8A045').lineWidth(7).moveTo(ix1, triInnerTopY).lineTo(ix2, h).stroke();
      doc.strokeColor('#EAD08A').lineWidth(1.8).moveTo(ix1, triInnerTopY + 1).lineTo(ix2, h + 1).stroke();
      doc.restore();
    };

    drawCornerTriangle(false);
    drawCornerTriangle(true);

    // Left & Right golden laurel branches
    drawLaurelBranch(doc, 122, 392, -1);
    drawLaurelBranch(doc, w - 122, 392, 1);

    // Top Ministry & IT Park Logos
    drawTopLogos(doc, w / 2);

    // Main Certificate Typography
    doc
      .font('Times-Roman')
      .fontSize(42)
      .fillColor(deepGold)
      .text('CERTIFICATE', 60, 86, { width: w - 120, align: 'center', characterSpacing: 9 });

    doc
      .font('Times-Roman')
      .fontSize(17)
      .fillColor(deepGold)
      .text('OF COMPLETION', 60, 140, { width: w - 120, align: 'center', characterSpacing: 5 });

    doc
      .font('Helvetica-Bold')
      .fontSize(11.5)
      .fillColor(deepGold)
      .text(cert.centerName.toUpperCase(), 60, 168, {
        width: w - 120,
        align: 'center',
        characterSpacing: 1.5,
      });

    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor('#0F172A')
      .text('This Certificate has been awarded to', 80, 206, { width: w - 160, align: 'center' });

    doc
      .font('Helvetica')
      .fontSize(31)
      .fillColor('#0F172A')
      .text(cert.studentFullName, 80, 228, { width: w - 160, align: 'center' });

    doc
      .save()
      .strokeColor('#0F172A')
      .lineWidth(1.5)
      .moveTo(w / 2 - 210, 270)
      .lineTo(w / 2 + 210, 270)
      .stroke()
      .restore();

    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#0F172A')
      .text(
        `<<${cert.courseName}>>\n${cert.resultScore}`,
        140,
        288,
        { width: w - 280, align: 'center', lineGap: 3 },
      );

    const dateRange = `${formatCertificateDate(cert.courseStartDate)} - ${formatCertificateDate(cert.courseEndDate)}`;
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#0F172A')
      .text(dateRange, 120, 344, { width: w - 240, align: 'center' });

    if (cert.status === CertificateStatus.REVOKED) {
      doc
        .font('Helvetica-Bold')
        .fontSize(20)
        .fillColor('#DC2626')
        .text('BEKOR QILINGAN / REVOKED', 80, 366, { width: w - 160, align: 'center' });
    }

    // Footer: Signature (Left), Circular Blue Stamp + Director Name + ID (Center), QR Code (Right)
    const footerY = 438;

    // Stylized cursive signature on left
    doc.save();
    doc.strokeColor('#0F172A').lineWidth(1.6);
    const sigX = w / 2 - 168;
    const sigY = footerY + 4;
    doc
      .moveTo(sigX, sigY + 10)
      .bezierCurveTo(sigX + 10, sigY - 28, sigX + 38, sigY - 26, sigX + 24, sigY + 8)
      .bezierCurveTo(sigX + 14, sigY + 20, sigX + 4, sigY + 12, sigX + 34, sigY - 2)
      .bezierCurveTo(sigX + 46, sigY - 12, sigX + 54, sigY + 8, sigX + 70, sigY - 4)
      .bezierCurveTo(sigX + 78, sigY - 10, sigX + 84, sigY + 10, sigX + 98, sigY - 8)
      .stroke();
    doc.restore();

    // Circular Blue Stamp in center
    const stampCx = w / 2;
    const stampCy = footerY;
    doc.save();
    doc.strokeColor('#1D4ED8').lineWidth(1.8).circle(stampCx, stampCy, 43).stroke();
    doc.strokeColor('#1D4ED8').lineWidth(0.9).circle(stampCx, stampCy, 39).stroke();
    doc.strokeColor('#1D4ED8').lineWidth(1.2).circle(stampCx, stampCy, 25).stroke();
    const stampWords = cert.centerName.toUpperCase().split(/\s+/).slice(0, 3).join('\n');
    doc
      .font('Helvetica-Bold')
      .fontSize(6.2)
      .fillColor('#1D4ED8')
      .text(stampWords, stampCx - 22, stampCy - 11, {
        width: 44,
        align: 'center',
        lineGap: 1,
      });
    doc
      .font('Helvetica-Bold')
      .fontSize(5.5)
      .fillColor('#1D4ED8')
      .text('*  UZBEKISTAN  *', stampCx - 32, stampCy + 28, { width: 64, align: 'center' });
    doc
      .font('Helvetica-Bold')
      .fontSize(5.2)
      .fillColor('#1D4ED8')
      .text('OFFICIAL SEAL', stampCx - 32, stampCy - 35, { width: 64, align: 'center' });
    doc.restore();

    // QR Code on right
    doc.image(qrBuffer, w / 2 + 80, footerY - 42, { width: 84, height: 84 });

    // Director name + Certificate ID centered below stamp
    const director = (setting?.directorName || 'MARKAZ DIREKTORI').toUpperCase();
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#0F172A')
      .text(director, w / 2 - 150, 496, { width: 300, align: 'center', underline: true });

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#0F172A')
      .text(`ID:${cert.certificateNumber}`, w / 2 - 150, 514, {
        width: 300,
        align: 'center',
        underline: true,
      });

    doc.end();
  });
}
