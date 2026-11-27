import { EnrollmentStatus, RoleName, StudentCourseStatus } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/prisma.js';
import { recordAuditLog } from '../../utils/audit.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { paginatedResponse, parsePagination } from '../../utils/pagination.js';
import { syncStudentPaymentMonths } from '../payments/payments.billing.js';

export async function listGroups(query: Record<string, unknown>, user?: { userId: string; role: RoleName }) {
  const { page, limit, skip } = parsePagination(query, 30);
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const courseId = typeof query.courseId === 'string' ? query.courseId : undefined;
  const teacherIdFilter = typeof query.teacherId === 'string' ? query.teacherId : undefined;
  const status = typeof query.status === 'string' ? query.status : undefined;

  let effectiveTeacherId = teacherIdFilter;
  if (user?.role === RoleName.TEACHER) {
    const teacher = await prisma.teacher.findUnique({ where: { userId: user.userId } });
    if (teacher) {
      effectiveTeacherId = teacher.id;
    }
  }

  const where = {
    ...(courseId ? { courseId } : {}),
    ...(effectiveTeacherId ? { teacherId: effectiveTeacherId } : {}),
    ...(status ? { status: status as never } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { course: { name: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.group.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        course: true,
        teacher: {
          include: { user: { select: { id: true, fullName: true, phone: true } } },
        },
        _count: {
          select: {
            groupStudents: { where: { status: EnrollmentStatus.ACTIVE } },
          },
        },
      },
    }),
    prisma.group.count({ where }),
  ]);

  return paginatedResponse(items, total, page, limit);
}

export async function getGroupById(id: string) {
  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      course: true,
      teacher: {
        include: { user: { select: { id: true, fullName: true, phone: true, email: true } } },
      },
      groupStudents: {
        orderBy: { joinedAt: 'desc' },
        include: {
          student: {
            include: {
              faceProfile: { select: { id: true, angleCount: true, modelVersion: true } },
              studentCourses: true,
            },
          },
        },
      },
    },
  });

  if (!group) throw new NotFoundError('Guruh topilmadi');
  return group;
}

export async function createGroup(data: Record<string, unknown>, actorId: string, req: Request) {
  const { studentIds, ...groupData } = data as { studentIds?: string[]; [key: string]: unknown };
  const course = await prisma.course.findUnique({ where: { id: String(groupData.courseId) } });
  if (!course) throw new NotFoundError('Kurs topilmadi');

  const teacher = await prisma.teacher.findUnique({ where: { id: String(groupData.teacherId) } });
  if (!teacher) throw new NotFoundError('O‘qituvchi topilmadi');

  const created = await prisma.group.create({
    data: groupData as never,
    include: {
      course: true,
      teacher: { include: { user: { select: { id: true, fullName: true, phone: true } } } },
    },
  });

  if (Array.isArray(studentIds) && studentIds.length > 0) {
    const uniqueIds = [...new Set(studentIds)];
    for (const studentId of uniqueIds) {
      const st = await prisma.student.findUnique({ where: { id: studentId } });
      if (!st) continue;
      const fee = Number(st.monthlyFee) > 0 ? Number(st.monthlyFee) : Number(course.monthlyPrice);
      await prisma.groupStudent.upsert({
        where: { groupId_studentId: { groupId: created.id, studentId } },
        update: { status: EnrollmentStatus.ACTIVE, leftAt: null, customMonthlyFee: fee },
        create: {
          groupId: created.id,
          studentId,
          customMonthlyFee: fee,
          status: EnrollmentStatus.ACTIVE,
        },
      });
      await prisma.studentCourse.upsert({
        where: { studentId_courseId: { studentId, courseId: course.id } },
        update: { status: StudentCourseStatus.ENROLLED },
        create: {
          studentId,
          courseId: course.id,
          monthlyFee: fee,
          status: StudentCourseStatus.ENROLLED,
        },
      });
      await syncStudentPaymentMonths(studentId);
    }
  }

  await recordAuditLog({
    userId: actorId,
    action: 'GROUP_CREATE',
    entity: 'groups',
    entityId: created.id,
    newValues: created,
    req,
  });

  return created;
}

export async function updateGroup(id: string, data: Record<string, unknown>, actorId: string, req: Request) {
  const existing = await prisma.group.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Guruh topilmadi');

  const updated = await prisma.group.update({
    where: { id },
    data: data as never,
    include: {
      course: true,
      teacher: { include: { user: { select: { id: true, fullName: true, phone: true } } } },
    },
  });

  await recordAuditLog({
    userId: actorId,
    action: 'GROUP_UPDATE',
    entity: 'groups',
    entityId: id,
    oldValues: existing,
    newValues: updated,
    req,
  });

  return updated;
}

export async function enrollStudentToGroup(
  groupId: string,
  input: { studentId: string; customMonthlyFee?: number; joinedAt?: Date },
  actorId: string,
  req: Request,
) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      course: true,
      _count: { select: { groupStudents: { where: { status: EnrollmentStatus.ACTIVE } } } },
    },
  });
  if (!group) throw new NotFoundError('Guruh topilmadi');

  const student = await prisma.student.findUnique({ where: { id: input.studentId } });
  if (!student) throw new NotFoundError('O‘quvchi topilmadi');

  const existingEnrollment = await prisma.groupStudent.findUnique({
    where: { groupId_studentId: { groupId, studentId: input.studentId } },
  });

  if (existingEnrollment && existingEnrollment.status === EnrollmentStatus.ACTIVE) {
    throw new ConflictError('O‘quvchi ushbu guruhga allaqachon biriktirilgan');
  }

  if (group._count.groupStudents >= group.maxStudents) {
    throw new ValidationError(`Guruh to‘lgan (maksimal ${group.maxStudents} ta o‘quvchi)`);
  }

  const fee = input.customMonthlyFee ?? Number(group.course.monthlyPrice);
  const joinedAt = input.joinedAt ?? new Date();

  const result = await prisma.$transaction(async (tx) => {
    const enrollment = await tx.groupStudent.upsert({
      where: { groupId_studentId: { groupId, studentId: input.studentId } },
      update: {
        status: EnrollmentStatus.ACTIVE,
        joinedAt,
        leftAt: null,
        customMonthlyFee: fee,
      },
      create: {
        groupId,
        studentId: input.studentId,
        joinedAt,
        customMonthlyFee: fee,
        status: EnrollmentStatus.ACTIVE,
      },
    });

    await tx.studentCourse.upsert({
      where: { studentId_courseId: { studentId: input.studentId, courseId: group.courseId } },
      update: {
        status: StudentCourseStatus.ENROLLED,
        monthlyFee: fee,
      },
      create: {
        studentId: input.studentId,
        courseId: group.courseId,
        enrolledAt: joinedAt,
        monthlyFee: fee,
        status: StudentCourseStatus.ENROLLED,
      },
    });

    // Update student summary monthly fee if currently 0
    if (Number(student.monthlyFee) === 0) {
      await tx.student.update({
        where: { id: student.id },
        data: { monthlyFee: fee },
      });
    }

    return enrollment;
  });

  await syncStudentPaymentMonths(input.studentId);

  await recordAuditLog({
    userId: actorId,
    action: 'GROUP_ENROLL_STUDENT',
    entity: 'group_students',
    entityId: result.id,
    newValues: { groupId, studentId: input.studentId, fee },
    req,
  });

  return result;
}

export async function removeStudentFromGroup(
  groupId: string,
  studentId: string,
  actorId: string,
  req: Request,
) {
  const existing = await prisma.groupStudent.findUnique({
    where: { groupId_studentId: { groupId, studentId } },
  });
  if (!existing) throw new NotFoundError('O‘quvchi ushbu guruhda topilmadi');

  const updated = await prisma.groupStudent.update({
    where: { id: existing.id },
    data: { status: EnrollmentStatus.LEFT, leftAt: new Date() },
  });

  await recordAuditLog({
    userId: actorId,
    action: 'GROUP_REMOVE_STUDENT',
    entity: 'group_students',
    entityId: existing.id,
    oldValues: existing,
    newValues: updated,
    req,
  });

  return updated;
}

export async function deleteGroup(id: string, actorId: string, req: Request) {
  const existing = await prisma.group.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Guruh topilmadi');

  await prisma.group.delete({ where: { id } });

  await recordAuditLog({
    userId: actorId,
    action: 'GROUP_DELETE',
    entity: 'groups',
    entityId: id,
    oldValues: existing,
    req,
  });
}

export async function transferStudentBetweenGroups(
  sourceGroupId: string,
  studentId: string,
  input: { targetGroupId: string; customMonthlyFee?: number; reason?: string },
  actorId: string,
  req: Request,
) {
  if (sourceGroupId === input.targetGroupId) {
    throw new ValidationError('O‘quvchi allaqachon shu guruhda');
  }

  const [sourceEnrollment, targetGroup, student] = await Promise.all([
    prisma.groupStudent.findUnique({
      where: { groupId_studentId: { groupId: sourceGroupId, studentId } },
    }),
    prisma.group.findUnique({
      where: { id: input.targetGroupId },
      include: {
        course: true,
        _count: { select: { groupStudents: { where: { status: EnrollmentStatus.ACTIVE } } } },
      },
    }),
    prisma.student.findUnique({ where: { id: studentId } }),
  ]);

  if (!sourceEnrollment || sourceEnrollment.status !== EnrollmentStatus.ACTIVE) {
    throw new NotFoundError('O‘quvchi joriy guruhda faol emas');
  }
  if (!targetGroup) throw new NotFoundError('Yangi guruh topilmadi');
  if (!student) throw new NotFoundError('O‘quvchi topilmadi');

  const existingTarget = await prisma.groupStudent.findUnique({
    where: { groupId_studentId: { groupId: targetGroup.id, studentId } },
  });
  if (existingTarget && existingTarget.status === EnrollmentStatus.ACTIVE) {
    throw new ConflictError('O‘quvchi tanlangan guruhda allaqachon mavjud');
  }

  if (targetGroup._count.groupStudents >= targetGroup.maxStudents) {
    throw new ValidationError(`Yangi guruh to‘lgan (maksimal ${targetGroup.maxStudents} ta o‘quvchi)`);
  }

  const fee = input.customMonthlyFee ?? Number(targetGroup.course.monthlyPrice);
  const now = new Date();

  const transferred = await prisma.$transaction(async (tx) => {
    await tx.groupStudent.update({
      where: { id: sourceEnrollment.id },
      data: { status: EnrollmentStatus.LEFT, leftAt: now },
    });

    const newEnrollment = await tx.groupStudent.upsert({
      where: { groupId_studentId: { groupId: targetGroup.id, studentId } },
      update: {
        status: EnrollmentStatus.ACTIVE,
        joinedAt: now,
        leftAt: null,
        customMonthlyFee: fee,
      },
      create: {
        groupId: targetGroup.id,
        studentId,
        joinedAt: now,
        customMonthlyFee: fee,
        status: EnrollmentStatus.ACTIVE,
      },
    });

    await tx.studentCourse.upsert({
      where: { studentId_courseId: { studentId, courseId: targetGroup.courseId } },
      update: { status: StudentCourseStatus.ENROLLED, monthlyFee: fee },
      create: {
        studentId,
        courseId: targetGroup.courseId,
        enrolledAt: now,
        monthlyFee: fee,
        status: StudentCourseStatus.ENROLLED,
      },
    });

    return newEnrollment;
  });

  await syncStudentPaymentMonths(studentId);

  await recordAuditLog({
    userId: actorId,
    action: 'GROUP_STUDENT_TRANSFER',
    entity: 'group_students',
    entityId: transferred.id,
    oldValues: { sourceGroupId, studentId },
    newValues: { targetGroupId: targetGroup.id, studentId, reason: input.reason ?? null },
    req,
  });

  return transferred;
}

export async function updateStudentCourseResult(
  groupId: string,
  studentId: string,
  input: { resultScore: number; resultGrade: string; teacherComment?: string | null; completed?: boolean },
  actor: { userId: string; role: RoleName },
  req: Request,
) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { teacher: true },
  });
  if (!group) throw new NotFoundError('Guruh topilmadi');

  if (actor.role === RoleName.TEACHER && group.teacher.userId !== actor.userId) {
    throw new ForbiddenError('Faqat o‘zingizning guruhingiz natijalarini kiritishingiz mumkin');
  }

  const sc = await prisma.studentCourse.upsert({
    where: { studentId_courseId: { studentId, courseId: group.courseId } },
    update: {
      resultScore: input.resultScore,
      resultGrade: input.resultGrade,
      teacherComment: input.teacherComment ?? null,
      status: input.completed ? StudentCourseStatus.COMPLETED : StudentCourseStatus.ENROLLED,
      completedAt: input.completed ? new Date() : null,
    },
    create: {
      studentId,
      courseId: group.courseId,
      monthlyFee: 0,
      resultScore: input.resultScore,
      resultGrade: input.resultGrade,
      teacherComment: input.teacherComment ?? null,
      status: input.completed ? StudentCourseStatus.COMPLETED : StudentCourseStatus.ENROLLED,
      completedAt: input.completed ? new Date() : null,
    },
  });

  await recordAuditLog({
    userId: actor.userId,
    action: 'STUDENT_RESULT_UPDATE',
    entity: 'student_courses',
    entityId: sc.id,
    newValues: sc,
    req,
  });

  return sc;
}
