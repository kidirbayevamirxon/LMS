import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';

const app = createApp();

let superAdminToken = '';
let refreshToken = '';
let cashierToken = '';
let teacherToken = '';
let aliStudentId = '';
let backendGroupId = '';
let backendCourseId = '';
let createdStudentId = '';
let createdPaymentId = '';
let generatedCertNumber = '';
let generatedCertId = '';

describe('EduManager Full Backend Integration Tests', () => {
  beforeAll(async () => {
    const ali = await prisma.student.findUnique({ where: { phone: '+998901000006' } });
    aliStudentId = ali?.id ?? '';
    const grp = await prisma.group.findFirst({ where: { name: 'Backend-01' } });
    backendGroupId = grp?.id ?? '';
    backendCourseId = grp?.courseId ?? '';
  });

  afterAll(async () => {
    if (createdStudentId) {
      await prisma.student.deleteMany({ where: { id: createdStudentId } });
    }
    await prisma.$disconnect();
  });

  it('GET /api/health returns healthy PostgreSQL status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  it('Authenticates Super Admin, Cashier, Teacher and rotates refresh token', async () => {
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ phone: '+998901000001', password: 'EduManager2026!' });
    expect(adminLogin.status).toBe(200);
    superAdminToken = adminLogin.body.data.accessToken;
    refreshToken = adminLogin.body.data.refreshToken;
    expect(superAdminToken).toBeTruthy();

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    expect(refreshRes.status).toBe(200);
    superAdminToken = refreshRes.body.data.accessToken;
    refreshToken = refreshRes.body.data.refreshToken;

    const cashierLogin = await request(app)
      .post('/api/auth/login')
      .send({ phone: '+998901000003', password: 'EduManager2026!' });
    expect(cashierLogin.status).toBe(200);
    cashierToken = cashierLogin.body.data.accessToken;

    const teacherLogin = await request(app)
      .post('/api/auth/login')
      .send({ phone: '+998901000004', password: 'EduManager2026!' });
    expect(teacherLogin.status).toBe(200);
    teacherToken = teacherLogin.body.data.accessToken;
  });

  it('Enforces RBAC so Cashier cannot alter center settings', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ centerName: 'Hacked' });
    expect(res.status).toBe(403);
  });

  it('Lists students, exports Excel & PDF, and returns Aliyev Ali debt details', async () => {
    const listRes = await request(app)
      .get('/api/students?search=Aliyev')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThan(0);

    const profileRes = await request(app)
      .get(`/api/students/${aliStudentId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(profileRes.status).toBe(200);
    expect(profileRes.body.data.debtsSummary.totalDebt).toBe(200000);

    const excelRes = await request(app)
      .get('/api/students/export/excel')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(excelRes.status).toBe(200);

    const pdfRes = await request(app)
      .get('/api/students/export/pdf')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(pdfRes.status).toBe(200);
  });

  it('Creates student, enrolls in group, processes partial/advance payments, cancels & generates receipt PDF', async () => {
    const uniquePhone = `+99899${Math.floor(1000000 + Math.random() * 8999999)}`;
    const createRes = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        fullName: 'Test Integration Student',
        phone: uniquePhone,
        gender: 'MALE',
        monthlyFee: 500000,
        groupIds: [backendGroupId],
      });
    expect(createRes.status).toBe(201);
    createdStudentId = createRes.body.data.id;

    // Pay 300,000 partial payment
    const payRes = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        studentId: createdStudentId,
        amount: 300000,
        paymentMethod: 'CASH',
        billingYear: 2026,
        billingMonth: 11,
      });
    expect(payRes.status).toBe(201);
    createdPaymentId = payRes.body.data[0].id;

    const receiptPdf = await request(app)
      .get(`/api/payments/${createdPaymentId}/receipt/pdf`)
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(receiptPdf.status).toBe(200);

    const cancelRes = await request(app)
      .post(`/api/payments/${createdPaymentId}/cancel`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ reason: 'Test cancellation' });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('CANCELLED');
  });

  it('Registers encrypted Face ID embeddings, recognizes face for attendance, blocks duplicate daily check-in, and deletes Face ID', async () => {
    const sampleEmbedding = Array.from({ length: 192 }, (_, idx) => Math.sin(idx * 0.13 + 0.5));
    const regRes = await request(app)
      .post('/api/face/register')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        studentId: createdStudentId,
        embeddings: [sampleEmbedding, sampleEmbedding],
        modelVersion: 'mobilefacenet-v1',
        livenessVerified: true,
      });
    expect(regRes.status).toBe(201);
    expect(regRes.body.data.embeddingDimension).toBe(192);

    const recRes = await request(app)
      .post('/api/face/recognize')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        embeddings: [sampleEmbedding],
        groupId: backendGroupId,
        livenessPassed: true,
      });
    expect(recRes.status).toBe(200);
    expect(recRes.body.data.matches[0].matched).toBe(true);
    expect(recRes.body.data.matches[0].attendanceAction).toBe('CHECKED_IN');

    // Second scan on same day must NOT create duplicate record
    const recRes2 = await request(app)
      .post('/api/face/recognize')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        embeddings: [sampleEmbedding],
        groupId: backendGroupId,
        livenessPassed: true,
      });
    expect(recRes2.status).toBe(200);
    expect(recRes2.body.data.matches[0].alreadyMarked).toBe(true);

    const delFace = await request(app)
      .delete(`/api/face/${createdStudentId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(delFace.status).toBe(200);
  });

  it('Generates certificate, prevents duplicate per student+course, exports PDF, and verifies publicly via QR endpoint', async () => {
    const genRes = await request(app)
      .post('/api/certificates/generate')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        studentId: createdStudentId,
        courseId: backendCourseId,
        groupId: backendGroupId,
        resultScore: '98% (A+)',
      });
    expect(genRes.status).toBe(201);
    generatedCertId = genRes.body.data.id;
    generatedCertNumber = genRes.body.data.certificateNumber;

    // Duplicate prevention
    const dupRes = await request(app)
      .post('/api/certificates/generate')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        studentId: createdStudentId,
        courseId: backendCourseId,
      });
    expect(dupRes.status).toBe(409);

    const pdfRes = await request(app)
      .get(`/api/certificates/${generatedCertId}/pdf`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(pdfRes.status).toBe(200);

    // Public verification without token
    const verifyRes = await request(app).get(`/api/certificates/verify/${generatedCertNumber}`);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.valid).toBe(true);
  });

  it('Returns full Dashboard analytics and Swagger OpenAPI spec', async () => {
    const dashRes = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.data.stats.totalStudents).toBeGreaterThan(0);

    const docsRes = await request(app).get('/api/docs.json');
    expect(docsRes.status).toBe(200);
    expect(docsRes.body.openapi).toBe('3.0.3');
  });
});
