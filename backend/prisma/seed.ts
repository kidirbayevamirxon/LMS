import {
  AttendanceMethod,
  AttendanceStatus,
  CertificateStatus,
  CourseStatus,
  EnrollmentStatus,
  Gender,
  GroupStatus,
  NotificationType,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  PrismaClient,
  RoleName,
  StudentCourseStatus,
  StudentStatus,
  TeacherStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding EduManager PostgreSQL database...');

  const roleDefs: Array<{
    name: RoleName;
    displayName: string;
    description: string;
    permissions: string[];
  }> = [
    {
      name: RoleName.SUPER_ADMIN,
      displayName: 'Super Admin',
      description: 'Tizimning barcha modullari ustidan to‘liq nazorat',
      permissions: ['*'],
    },
    {
      name: RoleName.ADMIN,
      displayName: 'Administrator',
      description: 'O‘quvchilar, guruhlar, davomat va sertifikatlarni boshqarish',
      permissions: [
        'students:manage',
        'courses:manage',
        'groups:manage',
        'payments:view',
        'attendance:manage',
        'certificates:manage',
        'face:manage',
        'dashboard:view',
      ],
    },
    {
      name: RoleName.CASHIER,
      displayName: 'Kassir',
      description: 'To‘lovlarni qabul qilish, chek chiqarish va qarzdorlik nazorati',
      permissions: ['payments:manage', 'students:view', 'dashboard:view'],
    },
    {
      name: RoleName.TEACHER,
      displayName: 'O‘qituvchi',
      description: 'O‘z guruhlari, davomat va o‘quvchi natijalarini kiritish',
      permissions: ['groups:own', 'attendance:manage', 'results:manage'],
    },
    {
      name: RoleName.STUDENT,
      displayName: 'O‘quvchi',
      description: 'Shaxsiy kabinet, to‘lovlar, davomat va sertifikatlar',
      permissions: ['self:view'],
    },
  ];

  const roles: Record<RoleName, string> = {} as Record<RoleName, string>;
  for (const r of roleDefs) {
    const upserted = await prisma.role.upsert({
      where: { name: r.name },
      update: {
        displayName: r.displayName,
        description: r.description,
        permissions: r.permissions,
      },
      create: r,
    });
    roles[r.name] = upserted.id;
  }

  // Default Settings
  const existingSetting = await prisma.setting.findFirst();
  if (!existingSetting) {
    await prisma.setting.create({
      data: {
        centerName: 'EduManager IT Academy',
        centerPhone: '+998 71 200 11 22',
        centerAddress: 'Toshkent sh., Chilonzor tumani, Bunyodkor ko‘chasi 12',
        directorName: 'Alisher Karimov',
        currency: 'UZS',
        paymentDueDay: 5,
        lateGraceMinutes: 15,
        faceRecognitionThreshold: 0.76,
        livenessRequired: true,
        defaultLanguage: 'uz',
        clickEnabled: true,
        paymeEnabled: true,
        fcmEnabled: false,
      },
    });
  }

  const passwordHash = await bcrypt.hash('EduManager2026!', 10);

  const superAdmin = await prisma.user.upsert({
    where: { phone: '+998901000001' },
    update: {},
    create: {
      roleId: roles[RoleName.SUPER_ADMIN],
      fullName: 'Alisher Karimov',
      email: 'superadmin@edumanager.uz',
      phone: '+998901000001',
      passwordHash,
      language: 'uz',
    },
  });

  const adminUser = await prisma.user.upsert({
    where: { phone: '+998901000002' },
    update: {},
    create: {
      roleId: roles[RoleName.ADMIN],
      fullName: 'Dilnoza Rakhimova',
      email: 'admin@edumanager.uz',
      phone: '+998901000002',
      passwordHash,
      language: 'uz',
    },
  });

  const cashierUser = await prisma.user.upsert({
    where: { phone: '+998901000003' },
    update: {},
    create: {
      roleId: roles[RoleName.CASHIER],
      fullName: 'Sardor Tursunov',
      email: 'cashier@edumanager.uz',
      phone: '+998901000003',
      passwordHash,
      language: 'uz',
    },
  });

  const teacherUser1 = await prisma.user.upsert({
    where: { phone: '+998901000004' },
    update: {},
    create: {
      roleId: roles[RoleName.TEACHER],
      fullName: 'Jasur Bekmurodov',
      email: 'jasur@edumanager.uz',
      phone: '+998901000004',
      passwordHash,
      language: 'uz',
    },
  });

  const teacherUser2 = await prisma.user.upsert({
    where: { phone: '+998901000005' },
    update: {},
    create: {
      roleId: roles[RoleName.TEACHER],
      fullName: 'Madina Azizova',
      email: 'madina@edumanager.uz',
      phone: '+998901000005',
      passwordHash,
      language: 'uz',
    },
  });

  const studentUser1 = await prisma.user.upsert({
    where: { phone: '+998901000006' },
    update: {},
    create: {
      roleId: roles[RoleName.STUDENT],
      fullName: 'Aliyev Ali',
      email: 'ali@edumanager.uz',
      phone: '+998901000006',
      passwordHash,
      language: 'uz',
    },
  });

  const teacher1 = await prisma.teacher.upsert({
    where: { userId: teacherUser1.id },
    update: {},
    create: {
      userId: teacherUser1.id,
      specialization: 'Backend Development (Node.js, PostgreSQL)',
      bio: '6 yillik tajribaga ega Senior Backend Engineer',
      salaryPercent: 40,
      status: TeacherStatus.ACTIVE,
    },
  });

  const teacher2 = await prisma.teacher.upsert({
    where: { userId: teacherUser2.id },
    update: {},
    create: {
      userId: teacherUser2.id,
      specialization: 'Frontend & Mobile UI (Next.js, React)',
      bio: '5 yillik tajribaga ega Frontend & Mobile Lead',
      salaryPercent: 40,
      status: TeacherStatus.ACTIVE,
    },
  });

  // Courses
  const backendCourse = await prisma.course.upsert({
    where: { name: 'Backend Development' },
    update: {},
    create: {
      name: 'Backend Development',
      durationMonths: 6,
      monthlyPrice: 500000,
      description: 'Node.js, TypeScript, Express, PostgreSQL, Prisma ORM va Docker asoslari',
      hasCertificate: true,
      status: CourseStatus.ACTIVE,
    },
  });

  const frontendCourse = await prisma.course.upsert({
    where: { name: 'Frontend & Mobile (Next.js)' },
    update: {},
    create: {
      name: 'Frontend & Mobile (Next.js)',
      durationMonths: 5,
      monthlyPrice: 550000,
      description: 'React, Next.js, TypeScript, Tailwind CSS va Capacitor Mobile',
      hasCertificate: true,
      status: CourseStatus.ACTIVE,
    },
  });

  const ieltsCourse = await prisma.course.upsert({
    where: { name: 'Ingliz tili (IELTS Intensive)' },
    update: {},
    create: {
      name: 'Ingliz tili (IELTS Intensive)',
      durationMonths: 4,
      monthlyPrice: 450000,
      description: 'IELTS Academic 7.5+ tayyorlov kursi',
      hasCertificate: true,
      status: CourseStatus.ACTIVE,
    },
  });

  // Groups
  let groupBackend = await prisma.group.findFirst({ where: { name: 'Backend-01' } });
  if (!groupBackend) {
    groupBackend = await prisma.group.create({
      data: {
        name: 'Backend-01',
        courseId: backendCourse.id,
        teacherId: teacher1.id,
        lessonDays: ['MON', 'WED', 'FRI'],
        startTime: '09:00',
        endTime: '11:00',
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-02-28T00:00:00.000Z'),
        maxStudents: 18,
        room: 'A-201',
        status: GroupStatus.ACTIVE,
      },
    });
  }

  let groupFrontend = await prisma.group.findFirst({ where: { name: 'Frontend-02' } });
  if (!groupFrontend) {
    groupFrontend = await prisma.group.create({
      data: {
        name: 'Frontend-02',
        courseId: frontendCourse.id,
        teacherId: teacher2.id,
        lessonDays: ['TUE', 'THU', 'SAT'],
        startTime: '14:00',
        endTime: '16:00',
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-31T00:00:00.000Z'),
        maxStudents: 16,
        room: 'B-105',
        status: GroupStatus.ACTIVE,
      },
    });
  }

  let groupIelts = await prisma.group.findFirst({ where: { name: 'IELTS-01' } });
  if (!groupIelts) {
    groupIelts = await prisma.group.create({
      data: {
        name: 'IELTS-01',
        courseId: ieltsCourse.id,
        teacherId: teacher2.id,
        lessonDays: ['MON', 'WED', 'FRI'],
        startTime: '16:30',
        endTime: '18:30',
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-11-30T00:00:00.000Z'),
        maxStudents: 14,
        room: 'C-302',
        status: GroupStatus.ACTIVE,
      },
    });
  }

  // Students
  const ali = await prisma.student.upsert({
    where: { phone: '+998901000006' },
    update: {},
    create: {
      userId: studentUser1.id,
      fullName: 'Aliyev Ali',
      phone: '+998901000006',
      birthDate: new Date('2004-05-14T00:00:00.000Z'),
      gender: Gender.MALE,
      address: 'Toshkent sh., Yunusobod 4-kvartal',
      parentPhone: '+998901000099',
      enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      monthlyFee: 500000,
      status: StudentStatus.ACTIVE,
    },
  });

  const studentsSeed = [
    {
      fullName: 'Karimova Malika',
      phone: '+998902221101',
      gender: Gender.FEMALE,
      address: 'Toshkent sh., Mirzo Ulug‘bek',
      parentPhone: '+998902221100',
      monthlyFee: 550000,
      group: groupFrontend,
      course: frontendCourse,
      status: StudentStatus.ACTIVE,
    },
    {
      fullName: 'Toshmatov Bekzod',
      phone: '+998902221102',
      gender: Gender.MALE,
      address: 'Toshkent sh., Shayxontohur',
      parentPhone: '+998902221192',
      monthlyFee: 500000,
      group: groupBackend,
      course: backendCourse,
      status: StudentStatus.ACTIVE,
    },
    {
      fullName: 'Yusupova Nigora',
      phone: '+998902221103',
      gender: Gender.FEMALE,
      address: 'Toshkent sh., Chilonzor',
      parentPhone: '+998902221193',
      monthlyFee: 450000,
      group: groupIelts,
      course: ieltsCourse,
      status: StudentStatus.GRADUATED,
    },
    {
      fullName: 'Rahimov Jamshid',
      phone: '+998902221104',
      gender: Gender.MALE,
      address: 'Toshkent sh., Sergeli',
      parentPhone: '+998902221194',
      monthlyFee: 550000,
      group: groupFrontend,
      course: frontendCourse,
      status: StudentStatus.ACTIVE,
    },
    {
      fullName: 'Olimova Sevara',
      phone: '+998902221105',
      gender: Gender.FEMALE,
      address: 'Toshkent sh., Yakkasaroy',
      parentPhone: '+998902221195',
      monthlyFee: 500000,
      group: groupBackend,
      course: backendCourse,
      status: StudentStatus.INACTIVE,
    },
  ];

  // Enroll Aliyev Ali
  await prisma.groupStudent.upsert({
    where: { groupId_studentId: { groupId: groupBackend.id, studentId: ali.id } },
    update: {},
    create: {
      groupId: groupBackend.id,
      studentId: ali.id,
      joinedAt: new Date('2026-09-01T00:00:00.000Z'),
      customMonthlyFee: 500000,
      status: EnrollmentStatus.ACTIVE,
    },
  });
  await prisma.studentCourse.upsert({
    where: { studentId_courseId: { studentId: ali.id, courseId: backendCourse.id } },
    update: {},
    create: {
      studentId: ali.id,
      courseId: backendCourse.id,
      enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      monthlyFee: 500000,
      resultScore: 92.5,
      resultGrade: 'A',
      status: StudentCourseStatus.ENROLLED,
    },
  });

  // Seed Aliyev Ali exact payment scenario (Sep, Oct PAID 500k, Nov PARTIAL 300k / 200k debt)
  const aliMonths = [
    {
      year: 2026,
      month: 9,
      dueDate: new Date('2026-09-05T00:00:00.000Z'),
      paidAmount: 500000,
      remainingDebt: 0,
      status: PaymentStatus.PAID,
      receipt: 'EDU-202609-0001',
      payDate: new Date('2026-09-05T10:15:00.000Z'),
      method: PaymentMethod.CASH,
      type: PaymentType.REGULAR,
    },
    {
      year: 2026,
      month: 10,
      dueDate: new Date('2026-10-05T00:00:00.000Z'),
      paidAmount: 500000,
      remainingDebt: 0,
      status: PaymentStatus.PAID,
      receipt: 'EDU-202610-0002',
      payDate: new Date('2026-10-05T11:20:00.000Z'),
      method: PaymentMethod.CARD,
      type: PaymentType.REGULAR,
    },
    {
      year: 2026,
      month: 11,
      dueDate: new Date('2026-11-05T00:00:00.000Z'),
      paidAmount: 300000,
      remainingDebt: 200000,
      status: PaymentStatus.PARTIALLY_PAID,
      receipt: 'EDU-202611-0003',
      payDate: new Date('2026-11-05T14:05:00.000Z'),
      method: PaymentMethod.CLICK,
      type: PaymentType.PARTIAL,
    },
  ];

  for (const m of aliMonths) {
    const pm = await prisma.paymentMonth.upsert({
      where: {
        studentId_groupId_billingYear_billingMonth: {
          studentId: ali.id,
          groupId: groupBackend.id,
          billingYear: m.year,
          billingMonth: m.month,
        },
      },
      update: {},
      create: {
        studentId: ali.id,
        groupId: groupBackend.id,
        courseId: backendCourse.id,
        billingYear: m.year,
        billingMonth: m.month,
        dueDate: m.dueDate,
        expectedAmount: 500000,
        paidAmount: m.paidAmount,
        remainingDebt: m.remainingDebt,
        status: m.status,
      },
    });

    await prisma.payment.upsert({
      where: { receiptNumber: m.receipt },
      update: {},
      create: {
        receiptNumber: m.receipt,
        studentId: ali.id,
        paymentMonthId: pm.id,
        cashierId: cashierUser.id,
        amount: m.paidAmount,
        paymentDate: m.payDate,
        paymentMethod: m.method,
        paymentType: m.type,
        status: m.status,
        notes: `${m.year}-${String(m.month).padStart(2, '0')} oylik to‘lovi`,
      },
    });
  }

  let receiptSeq = 10;
  const createdStudents: Array<{ id: string; fullName: string; groupId: string; courseId: string; fee: number }> = [
    { id: ali.id, fullName: ali.fullName, groupId: groupBackend.id, courseId: backendCourse.id, fee: 500000 },
  ];

  for (const s of studentsSeed) {
    const student = await prisma.student.upsert({
      where: { phone: s.phone },
      update: {},
      create: {
        fullName: s.fullName,
        phone: s.phone,
        gender: s.gender,
        address: s.address,
        parentPhone: s.parentPhone,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
        monthlyFee: s.monthlyFee,
        status: s.status,
      },
    });

    createdStudents.push({
      id: student.id,
      fullName: student.fullName,
      groupId: s.group.id,
      courseId: s.course.id,
      fee: s.monthlyFee,
    });

    await prisma.groupStudent.upsert({
      where: { groupId_studentId: { groupId: s.group.id, studentId: student.id } },
      update: {},
      create: {
        groupId: s.group.id,
        studentId: student.id,
        joinedAt: new Date('2026-09-01T00:00:00.000Z'),
        customMonthlyFee: s.monthlyFee,
        status: s.status === StudentStatus.GRADUATED ? EnrollmentStatus.COMPLETED : EnrollmentStatus.ACTIVE,
      },
    });

    await prisma.studentCourse.upsert({
      where: { studentId_courseId: { studentId: student.id, courseId: s.course.id } },
      update: {},
      create: {
        studentId: student.id,
        courseId: s.course.id,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
        completedAt: s.status === StudentStatus.GRADUATED ? new Date('2026-11-20T00:00:00.000Z') : null,
        monthlyFee: s.monthlyFee,
        resultScore: s.status === StudentStatus.GRADUATED ? 95.0 : 86.0,
        resultGrade: s.status === StudentStatus.GRADUATED ? 'A+' : 'B+',
        status: s.status === StudentStatus.GRADUATED ? StudentCourseStatus.COMPLETED : StudentCourseStatus.ENROLLED,
      },
    });

    // Multi-month payment fixtures: Toshmatov Bekzod has 3 months OVERDUE! Others paid/partial.
    const months = [9, 10, 11];
    for (const month of months) {
      const isDebtor3Months = s.phone === '+998902221102';
      const isPaid = !isDebtor3Months && (month < 11 || s.phone !== '+998902221104');
      const paidAmt = isPaid ? s.monthlyFee : 0;
      const remDebt = s.monthlyFee - paidAmt;
      const status = isPaid ? PaymentStatus.PAID : PaymentStatus.OVERDUE;

      const pm = await prisma.paymentMonth.upsert({
        where: {
          studentId_groupId_billingYear_billingMonth: {
            studentId: student.id,
            groupId: s.group.id,
            billingYear: 2026,
            billingMonth: month,
          },
        },
        update: {},
        create: {
          studentId: student.id,
          groupId: s.group.id,
          courseId: s.course.id,
          billingYear: 2026,
          billingMonth: month,
          dueDate: new Date(`2026-${String(month).padStart(2, '0')}-05T00:00:00.000Z`),
          expectedAmount: s.monthlyFee,
          paidAmount: paidAmt,
          remainingDebt: remDebt,
          status,
        },
      });

      if (paidAmt > 0) {
        receiptSeq++;
        const recNo = `EDU-2026${String(month).padStart(2, '0')}-${String(receiptSeq).padStart(4, '0')}`;
        await prisma.payment.upsert({
          where: { receiptNumber: recNo },
          update: {},
          create: {
            receiptNumber: recNo,
            studentId: student.id,
            paymentMonthId: pm.id,
            cashierId: cashierUser.id,
            amount: paidAmt,
            paymentDate: new Date(`2026-${String(month).padStart(2, '0')}-04T12:00:00.000Z`),
            paymentMethod: month % 2 === 0 ? PaymentMethod.PAYME : PaymentMethod.CASH,
            paymentType: PaymentType.REGULAR,
            status: PaymentStatus.PAID,
          },
        });
      }
    }
  }

  // Attendance records for today & recent days
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayDate = new Date(`${todayStr}T00:00:00.000Z`);
  for (let idx = 0; idx < createdStudents.length; idx++) {
    const st = createdStudents[idx];
    const attStatus =
      idx === 0 ? AttendanceStatus.PRESENT : idx === 1 ? AttendanceStatus.LATE : idx === 2 ? AttendanceStatus.ABSENT : AttendanceStatus.PRESENT;
    await prisma.attendance.upsert({
      where: {
        studentId_groupId_attendanceDate: {
          studentId: st.id,
          groupId: st.groupId,
          attendanceDate: todayDate,
        },
      },
      update: {},
      create: {
        studentId: st.id,
        groupId: st.groupId,
        markedById: teacherUser1.id,
        attendanceDate: todayDate,
        checkInTime: attStatus === AttendanceStatus.ABSENT ? null : new Date(),
        status: attStatus,
        method: idx === 0 ? AttendanceMethod.FACE_ID : AttendanceMethod.MANUAL,
        recognitionConfidence: idx === 0 ? 0.9421 : null,
        livenessPassed: idx === 0,
      },
    });
  }

  // Issued Certificate for Yusupova Nigora
  const nigora = createdStudents.find((s) => s.fullName === 'Yusupova Nigora');
  if (nigora) {
    await prisma.certificate.upsert({
      where: { studentId_courseId: { studentId: nigora.id, courseId: nigora.courseId } },
      update: {},
      create: {
        certificateNumber: 'CERT-2026-000001',
        studentId: nigora.id,
        courseId: nigora.courseId,
        groupId: nigora.groupId,
        studentFullName: nigora.fullName,
        courseName: ieltsCourse.name,
        centerName: 'EduManager IT Academy',
        courseStartDate: new Date('2026-08-01T00:00:00.000Z'),
        courseEndDate: new Date('2026-11-20T00:00:00.000Z'),
        issuedDate: new Date('2026-11-21T00:00:00.000Z'),
        resultScore: '95% (Band 8.0)',
        qrCodeData: 'http://localhost:3000/certificate/verify/CERT-2026-000001',
        status: CertificateStatus.ISSUED,
        issuedById: adminUser.id,
      },
    });
  }

  // Notifications
  const existingNotifs = await prisma.notification.count();
  if (existingNotifs === 0) {
    await prisma.notification.createMany({
      data: [
        {
          userId: adminUser.id,
          studentId: ali.id,
          type: NotificationType.DEBT_ALERT,
          title: 'Qisman to‘lov qarzdorligi',
          body: 'Aliyev Ali 2026-yil noyabr oyi uchun 200 000 so‘m qarzdor.',
          isRead: false,
        },
        {
          userId: superAdmin.id,
          type: NotificationType.PAYMENT_OVERDUE,
          title: '3 oylik muddati o‘tgan qarz',
          body: 'Toshmatov Bekzod 3 oy davomida to‘lov qilmagan (1 500 000 so‘m).',
          isRead: false,
        },
        {
          userId: studentUser1.id,
          studentId: ali.id,
          type: NotificationType.PAYMENT_DUE_SOON,
          title: 'Oylik to‘lov eslatmasi',
          body: 'Backend Development kursi bo‘yicha qolgan 200 000 so‘mni to‘lashni unutmang.',
          isRead: false,
        },
      ],
    });
  }

  console.log('Seed completed successfully.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
