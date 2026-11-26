import { AttendanceMethod, AttendanceStatus, EnrollmentStatus, NotificationType } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/prisma.js';
import { recordAuditLog } from '../../utils/audit.js';
import {
  computeCentroid,
  cosineSimilarity,
  decryptEmbeddingData,
  encryptEmbeddingData,
  l2Normalize,
} from '../../utils/crypto.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { toUtcDateOnly } from '../attendance/attendance.service.js';
import { createAndDispatchNotification } from '../notifications/notifications.service.js';

interface StoredEmbeddingPayload {
  centroid: number[];
  samples: number[][];
}

const WEEKDAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function determineAttendanceStatus(startTimeHHMM: string, lateGraceMinutes: number, now: Date): AttendanceStatus {
  const [hStr, mStr] = startTimeHHMM.split(':');
  const startHours = Number(hStr);
  const startMinutes = Number(mStr);
  if (!Number.isFinite(startHours) || !Number.isFinite(startMinutes)) {
    return AttendanceStatus.PRESENT;
  }

  // Compare in local/center time (UTC+5 Uzbekistan by default if offset not set)
  const uzNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const currentTotalMins = uzNow.getUTCHours() * 60 + uzNow.getUTCMinutes();
  const classStartMins = startHours * 60 + startMinutes;

  return currentTotalMins > classStartMins + lateGraceMinutes
    ? AttendanceStatus.LATE
    : AttendanceStatus.PRESENT;
}

export async function registerFaceProfile(
  input: {
    studentId: string;
    embeddings: number[][];
    modelVersion: string;
    livenessVerified: boolean;
  },
  actorId: string,
  req: Request,
) {
  const student = await prisma.student.findUnique({ where: { id: input.studentId } });
  if (!student) throw new NotFoundError('O‘quvchi topilmadi');

  const dim = input.embeddings[0]?.length ?? 0;
  if (dim < 64 || dim > 1024) {
    throw new ValidationError('Face embedding o‘lchami yaroqsiz');
  }
  if (!input.embeddings.every((v) => v.length === dim)) {
    throw new ValidationError('Barcha embedding vektorlari bir xil o‘lchamda bo‘lishi kerak');
  }

  const normalizedSamples = input.embeddings.map((v) => l2Normalize(v));
  const centroid = computeCentroid(normalizedSamples);

  const encrypted = encryptEmbeddingData({
    centroid,
    samples: normalizedSamples,
  } satisfies StoredEmbeddingPayload);

  const profile = await prisma.faceProfile.upsert({
    where: { studentId: student.id },
    update: {
      encryptedEmbedding: encrypted.encryptedEmbedding,
      encryptionIv: encrypted.iv,
      encryptionAuthTag: encrypted.authTag,
      embeddingDimension: dim,
      modelVersion: input.modelVersion,
      angleCount: normalizedSamples.length,
      livenessVerified: input.livenessVerified,
      registeredById: actorId,
    },
    create: {
      studentId: student.id,
      encryptedEmbedding: encrypted.encryptedEmbedding,
      encryptionIv: encrypted.iv,
      encryptionAuthTag: encrypted.authTag,
      embeddingDimension: dim,
      modelVersion: input.modelVersion,
      angleCount: normalizedSamples.length,
      livenessVerified: input.livenessVerified,
      registeredById: actorId,
    },
    select: {
      id: true,
      studentId: true,
      embeddingDimension: true,
      modelVersion: true,
      angleCount: true,
      livenessVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await recordAuditLog({
    userId: actorId,
    action: 'FACE_PROFILE_REGISTER',
    entity: 'face_profiles',
    entityId: profile.id,
    newValues: { studentId: student.id, angleCount: normalizedSamples.length, dim, modelVersion: input.modelVersion },
    req,
  });

  return profile;
}

export async function recognizeFacesAndMarkAttendance(
  input: {
    embeddings: number[][];
    groupId?: string;
    livenessPassed: boolean;
    checkOut?: boolean;
  },
  actorId: string,
  req: Request,
) {
  const setting = await prisma.setting.findFirst();
  const threshold = Number(setting?.faceRecognitionThreshold ?? 0.76);
  const livenessRequired = setting?.livenessRequired ?? true;
  const lateGraceMinutes = setting?.lateGraceMinutes ?? 15;

  if (livenessRequired && !input.livenessPassed) {
    throw new ValidationError('Jonli yuz tekshiruvi (Liveness detection) muvaffaqiyatsiz');
  }

  const profiles = await prisma.faceProfile.findMany({
    include: {
      student: {
        include: {
          groupStudents: {
            where: { status: EnrollmentStatus.ACTIVE },
            include: { group: { include: { course: true } } },
          },
        },
      },
    },
  });

  const decodedProfiles = profiles.map((p) => {
    const payload = decryptEmbeddingData<StoredEmbeddingPayload>({
      encryptedEmbedding: p.encryptedEmbedding,
      iv: p.encryptionIv,
      authTag: p.encryptionAuthTag,
    });
    return {
      profile: p,
      payload,
    };
  });

  const now = new Date();
  const todayDate = toUtcDateOnly(now);
  const uzWeekday = WEEKDAY_CODES[new Date(now.getTime() + 5 * 60 * 60 * 1000).getUTCDay()];

  const matches = [];

  for (let faceIndex = 0; faceIndex < input.embeddings.length; faceIndex++) {
    const probe = l2Normalize(input.embeddings[faceIndex]);
    let bestScore = -1;
    let bestMatch: (typeof decodedProfiles)[number] | null = null;

    for (const candidate of decodedProfiles) {
      if (candidate.payload.centroid.length !== probe.length) continue;
      let score = cosineSimilarity(probe, candidate.payload.centroid);
      for (const sample of candidate.payload.samples) {
        const sScore = cosineSimilarity(probe, sample);
        if (sScore > score) score = sScore;
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    if (!bestMatch || bestScore < threshold) {
      matches.push({
        faceIndex,
        matched: false,
        confidence: bestScore > 0 ? Number(bestScore.toFixed(4)) : 0,
        threshold,
      });
      continue;
    }

    const student = bestMatch.profile.student;
    const enrollments = student.groupStudents;

    if (enrollments.length === 0) {
      matches.push({
        faceIndex,
        matched: true,
        confidence: Number(bestScore.toFixed(4)),
        student: { id: student.id, fullName: student.fullName, phone: student.phone },
        attendanceAction: 'NO_ACTIVE_GROUP',
      });
      continue;
    }

    const selectedEnrollment =
      (input.groupId ? enrollments.find((e) => e.groupId === input.groupId) : undefined) ??
      enrollments.find((e) => Array.isArray(e.group.lessonDays) && (e.group.lessonDays as string[]).includes(uzWeekday)) ??
      enrollments[0];

    const group = selectedEnrollment.group;

    const existingAttendance = await prisma.attendance.findUnique({
      where: {
        studentId_groupId_attendanceDate: {
          studentId: student.id,
          groupId: group.id,
          attendanceDate: todayDate,
        },
      },
    });

    if (existingAttendance) {
      if (input.checkOut && !existingAttendance.checkOutTime) {
        const updated = await prisma.attendance.update({
          where: { id: existingAttendance.id },
          data: { checkOutTime: now },
        });
        matches.push({
          faceIndex,
          matched: true,
          confidence: Number(bestScore.toFixed(4)),
          student: { id: student.id, fullName: student.fullName, phone: student.phone, photoUrl: student.photoUrl },
          group: { id: group.id, name: group.name, courseName: group.course.name },
          attendance: updated,
          attendanceAction: 'CHECKED_OUT',
          alreadyMarked: true,
        });
      } else {
        matches.push({
          faceIndex,
          matched: true,
          confidence: Number(bestScore.toFixed(4)),
          student: { id: student.id, fullName: student.fullName, phone: student.phone, photoUrl: student.photoUrl },
          group: { id: group.id, name: group.name, courseName: group.course.name },
          attendance: existingAttendance,
          attendanceAction: 'ALREADY_MARKED',
          alreadyMarked: true,
        });
      }
      continue;
    }

    const status = determineAttendanceStatus(group.startTime, lateGraceMinutes, now);

    const created = await prisma.attendance.create({
      data: {
        studentId: student.id,
        groupId: group.id,
        markedById: actorId,
        attendanceDate: todayDate,
        checkInTime: now,
        status,
        recognitionConfidence: Number(bestScore.toFixed(4)),
        method: AttendanceMethod.FACE_ID,
        livenessPassed: input.livenessPassed,
      },
    });

    await recordAuditLog({
      userId: actorId,
      action: 'ATTENDANCE_FACE_ID',
      entity: 'attendance',
      entityId: created.id,
      newValues: { studentId: student.id, groupId: group.id, confidence: Number(bestScore.toFixed(4)), status },
      req,
    });

    if (student.userId) {
      await createAndDispatchNotification({
        userId: student.userId,
        studentId: student.id,
        type: NotificationType.ATTENDANCE_ALERT,
        title: 'Face ID davomat qayd etildi',
        body: `${group.name} guruhiga kirish vaqti qayd etildi (${status}).`,
        data: { attendanceId: created.id, groupId: group.id },
      });
    }

    matches.push({
      faceIndex,
      matched: true,
      confidence: Number(bestScore.toFixed(4)),
      student: { id: student.id, fullName: student.fullName, phone: student.phone, photoUrl: student.photoUrl },
      group: { id: group.id, name: group.name, courseName: group.course.name },
      attendance: created,
      attendanceAction: 'CHECKED_IN',
      alreadyMarked: false,
    });
  }

  return {
    threshold,
    processedFaces: input.embeddings.length,
    matches,
  };
}

export async function deleteFaceProfile(studentId: string, actorId: string, req: Request) {
  const existing = await prisma.faceProfile.findUnique({ where: { studentId } });
  if (!existing) throw new NotFoundError('Face ID profili topilmadi');

  await prisma.faceProfile.delete({ where: { studentId } });

  await recordAuditLog({
    userId: actorId,
    action: 'FACE_PROFILE_DELETE',
    entity: 'face_profiles',
    entityId: existing.id,
    oldValues: { studentId },
    req,
  });
}
