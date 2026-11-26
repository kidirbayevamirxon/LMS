import { AttendanceMethod, AttendanceStatus, NotificationType, RoleName } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/prisma.js';
import { recordAuditLog } from '../../utils/audit.js';
import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { paginatedResponse, parsePagination } from '../../utils/pagination.js';
import { createAndDispatchNotification } from '../notifications/notifications.service.js';

export function toUtcDateOnly(dateInput?: string | Date): Date {
  const d = dateInput ? new Date(dateInput) : new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function markManualAttendance(
  items: Array<{
    studentId: string;
    groupId: string;
    attendanceDate?: string | Date;
    status: AttendanceStatus;
    checkInTime?: string | Date | null;
    checkOutTime?: string | Date | null;
    notes?: string | null;
  }>,
  actor: { userId: string; role: RoleName },
  req: Request,
) {
  const results = [];

  for (const item of items) {
    const group = await prisma.group.findUnique({
      where: { id: item.groupId },
      include: { teacher: true },
    });
    if (!group) throw new NotFoundError('Guruh topilmadi');

    if (actor.role === RoleName.TEACHER && group.teacher.userId !== actor.userId) {
      throw new ForbiddenError('Faqat o‘z guruhlaringiz davomatini belgilashingiz mumkin');
    }

    const student = await prisma.student.findUnique({ where: { id: item.studentId } });
    if (!student) throw new NotFoundError('O‘quvchi topilmadi');

    const dateOnly = toUtcDateOnly(item.attendanceDate);
    const now = new Date();

    const record = await prisma.attendance.upsert({
      where: {
        studentId_groupId_attendanceDate: {
          studentId: item.studentId,
          groupId: item.groupId,
          attendanceDate: dateOnly,
        },
      },
      update: {
        status: item.status,
        markedById: actor.userId,
        checkInTime:
          item.checkInTime !== undefined
            ? item.checkInTime
              ? new Date(item.checkInTime)
              : null
            : item.status === AttendanceStatus.ABSENT
              ? null
              : now,
        checkOutTime: item.checkOutTime ? new Date(item.checkOutTime) : undefined,
        notes: item.notes ?? undefined,
      },
      create: {
        studentId: item.studentId,
        groupId: item.groupId,
        markedById: actor.userId,
        attendanceDate: dateOnly,
        checkInTime:
          item.status === AttendanceStatus.ABSENT
            ? null
            : item.checkInTime
              ? new Date(item.checkInTime)
              : now,
        checkOutTime: item.checkOutTime ? new Date(item.checkOutTime) : null,
        status: item.status,
        method: AttendanceMethod.MANUAL,
        notes: item.notes ?? null,
      },
      include: {
        student: { select: { id: true, fullName: true, phone: true } },
        group: { select: { id: true, name: true } },
      },
    });

    if (item.status === AttendanceStatus.ABSENT || item.status === AttendanceStatus.LATE) {
      await createAndDispatchNotification({
        userId: student.userId,
        studentId: student.id,
        type: NotificationType.ATTENDANCE_ALERT,
        title: item.status === AttendanceStatus.ABSENT ? 'Darsga kelmadi' : 'Darsga kechikdi',
        body: `${student.fullName} — ${group.name} guruhi (${dateOnly.toISOString().slice(0, 10)}): ${item.status}`,
        data: { attendanceId: record.id, groupId: group.id },
      });
    }

    results.push(record);
  }

  await recordAuditLog({
    userId: actor.userId,
    action: 'ATTENDANCE_MARK',
    entity: 'attendance',
    entityId: results[0]?.id ?? null,
    newValues: { count: results.length },
    req,
  });

  return results;
}

export async function listAttendance(query: Record<string, unknown>, actor?: { userId: string; role: RoleName }) {
  const { page, limit, skip } = parsePagination(query, 30);
  const groupId = typeof query.groupId === 'string' ? query.groupId : undefined;
  const studentId = typeof query.studentId === 'string' ? query.studentId : undefined;
  const status = typeof query.status === 'string' ? (query.status as AttendanceStatus) : undefined;
  const dateStr = typeof query.date === 'string' ? query.date : undefined;

  let teacherGroupIds: string[] | undefined;
  if (actor?.role === RoleName.TEACHER) {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: actor.userId },
      include: { groups: { select: { id: true } } },
    });
    teacherGroupIds = teacher?.groups.map((g) => g.id) ?? [];
  }

  const where = {
    ...(groupId ? { groupId } : teacherGroupIds ? { groupId: { in: teacherGroupIds } } : {}),
    ...(studentId ? { studentId } : {}),
    ...(status ? { status } : {}),
    ...(dateStr ? { attendanceDate: toUtcDateOnly(dateStr) } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.attendance.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ attendanceDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        student: { select: { id: true, fullName: true, phone: true, photoUrl: true } },
        group: { include: { course: { select: { id: true, name: true } } } },
        markedBy: { select: { id: true, fullName: true } },
      },
    }),
    prisma.attendance.count({ where }),
  ]);

  return paginatedResponse(items, total, page, limit);
}

export async function getStudentAttendance(studentId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new NotFoundError('O‘quvchi topilmadi');

  const records = await prisma.attendance.findMany({
    where: { studentId },
    orderBy: { attendanceDate: 'desc' },
    include: {
      group: { include: { course: { select: { id: true, name: true } } } },
    },
  });

  const total = records.length;
  const present = records.filter((r) => r.status === AttendanceStatus.PRESENT).length;
  const late = records.filter((r) => r.status === AttendanceStatus.LATE).length;
  const absent = records.filter((r) => r.status === AttendanceStatus.ABSENT).length;
  const excused = records.filter((r) => r.status === AttendanceStatus.EXCUSED).length;

  return {
    student: { id: student.id, fullName: student.fullName },
    stats: {
      total,
      present,
      late,
      absent,
      excused,
      attendanceRate: total > 0 ? Number((((present + late) / total) * 100).toFixed(1)) : 100,
    },
    records,
  };
}
