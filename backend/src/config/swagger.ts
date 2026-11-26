export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'EduManager API',
    version: '1.0.0',
    description:
      "EduManager — O'quv markazlarini boshqarish tizimi (O'quvchilar, Guruhlar, Oylik To'lovlar, Face ID Davomat, Sertifikatlar) REST API hujjatlari.",
  },
  servers: [{ url: '/api', description: 'EduManager API Server' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'Auth', description: 'Kirish, Refresh Token, Chiqish' },
    { name: 'Users', description: 'Rollar va foydalanuvchilar boshqaruvi' },
    { name: 'Students', description: "O'quvchilar CRUD, Profil, Excel/PDF eksport" },
    { name: 'Courses', description: 'Kurslar boshqaruvi' },
    { name: 'Groups', description: "Guruhlar va o'quvchi biriktirish" },
    { name: 'Payments', description: "Oylik vznos, qisman/oldindan to'lov, qarzlar, cheklar" },
    { name: 'Attendance', description: 'Davomat jurnal va statistika' },
    { name: 'FaceID', description: 'Shifrlangan yuz embedding ro‘yxatga olish va tanish' },
    { name: 'Certificates', description: 'QR kodli PDF sertifikatlar va public tekshirish' },
    { name: 'Dashboard', description: 'Markaz statistikasi va grafiklar' },
    { name: 'Notifications', description: 'Bildirishnomalar va FCM' },
    { name: 'Settings', description: 'Markaz sozlamalari va Audit loglar' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Dashboard'],
        summary: 'Server holati tekshiruvi',
        security: [],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Telefon raqam va parol bilan kirish',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['phone', 'password'],
                properties: {
                  phone: { type: 'string', example: '+998901000001' },
                  password: { type: 'string', example: 'EduManager2026!' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'JWT access + refresh token' } },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh token orqali yangi access token olish',
        security: [],
        responses: { 200: { description: 'New token pair' } },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Tizimdan chiqish va refresh tokenni bekor qilish',
        responses: { 200: { description: 'Logged out' } },
      },
    },
    '/students': {
      get: {
        tags: ['Students'],
        summary: "O'quvchilar ro'yxati (qidiruv, filter, pagination)",
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'groupId', in: 'query', schema: { type: 'string' } },
          { name: 'debtorsOnly', in: 'query', schema: { type: 'boolean' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'GRADUATED'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { 200: { description: 'Paginated students list' } },
      },
      post: {
        tags: ['Students'],
        summary: "Yangi o'quvchi yaratish",
        responses: { 201: { description: 'Created student' } },
      },
    },
    '/students/{id}': {
      get: { tags: ['Students'], summary: "O'quvchi to'liq profili", responses: { 200: { description: 'Student profile' } } },
      patch: { tags: ['Students'], summary: "O'quvchi ma'lumotlarini yangilash", responses: { 200: { description: 'Updated' } } },
      delete: { tags: ['Students'], summary: "O'quvchini o'chirish", responses: { 200: { description: 'Deleted' } } },
    },
    '/students/export/excel': {
      get: { tags: ['Students'], summary: 'Excel (.xlsx) eksport', responses: { 200: { description: 'XLSX file' } } },
    },
    '/students/export/pdf': {
      get: { tags: ['Students'], summary: 'PDF eksport', responses: { 200: { description: 'PDF file' } } },
    },
    '/courses': {
      get: { tags: ['Courses'], summary: 'Kurslar ro‘yxati', responses: { 200: { description: 'OK' } } },
      post: { tags: ['Courses'], summary: 'Kurs yaratish', responses: { 201: { description: 'Created' } } },
    },
    '/groups': {
      get: { tags: ['Groups'], summary: 'Guruhlar ro‘yxati', responses: { 200: { description: 'OK' } } },
      post: { tags: ['Groups'], summary: 'Yangi guruh yaratish', responses: { 201: { description: 'Created' } } },
    },
    '/groups/{id}': {
      get: { tags: ['Groups'], summary: 'Guruh tafsilotlari', responses: { 200: { description: 'OK' } } },
      patch: { tags: ['Groups'], summary: 'Guruhni tahrirlash', responses: { 200: { description: 'Updated' } } },
    },
    '/groups/{id}/students': {
      post: { tags: ['Groups'], summary: 'Guruhga o‘quvchi biriktirish', responses: { 201: { description: 'Enrolled' } } },
    },
    '/payments': {
      get: { tags: ['Payments'], summary: "To'lovlar tarixi va summary", responses: { 200: { description: 'OK' } } },
      post: { tags: ['Payments'], summary: "To'lov qabul qilish (to'liq, qisman, oldindan)", responses: { 201: { description: 'Paid' } } },
    },
    '/payments/student/{studentId}': {
      get: { tags: ['Payments'], summary: "O'quvchining oylik to'lov jadvali va tarixi", responses: { 200: { description: 'OK' } } },
    },
    '/payments/debts': {
      get: { tags: ['Payments'], summary: "Qarzdor o'quvchilar ro'yxati", responses: { 200: { description: 'OK' } } },
    },
    '/payments/monthly-report': {
      get: { tags: ['Payments'], summary: "Oylik to'lov hisoboti", responses: { 200: { description: 'OK' } } },
    },
    '/attendance': {
      get: { tags: ['Attendance'], summary: 'Davomat ro‘yxati', responses: { 200: { description: 'OK' } } },
      post: { tags: ['Attendance'], summary: 'Manual davomat belgilash', responses: { 201: { description: 'Marked' } } },
    },
    '/attendance/student/{studentId}': {
      get: { tags: ['Attendance'], summary: "O'quvchi davomat tarixi", responses: { 200: { description: 'OK' } } },
    },
    '/face/register': {
      post: { tags: ['FaceID'], summary: "O'quvchi Face ID embeddinglarini shifrlab saqlash", responses: { 201: { description: 'Registered' } } },
    },
    '/face/recognize': {
      post: { tags: ['FaceID'], summary: 'Yuz embeddinglari orqali tanish va avtomatik davomat', responses: { 200: { description: 'Matched & marked' } } },
    },
    '/face/{studentId}': {
      delete: { tags: ['FaceID'], summary: "Face ID ma'lumotini o'chirish", responses: { 200: { description: 'Deleted' } } },
    },
    '/certificates/generate': {
      post: { tags: ['Certificates'], summary: 'Sertifikat yaratish', responses: { 201: { description: 'Generated' } } },
    },
    '/certificates': {
      get: { tags: ['Certificates'], summary: 'Sertifikatlar ro‘yxati', responses: { 200: { description: 'OK' } } },
    },
    '/certificates/{id}': {
      get: { tags: ['Certificates'], summary: 'Sertifikat ma’lumotlari', responses: { 200: { description: 'OK' } } },
    },
    '/certificates/{id}/pdf': {
      get: { tags: ['Certificates'], summary: 'QR kodli PDF sertifikat yuklash', responses: { 200: { description: 'PDF' } } },
    },
    '/certificates/verify/{number}': {
      get: { tags: ['Certificates'], summary: 'Public QR kod orqali sertifikatni tekshirish', security: [], responses: { 200: { description: 'Verification result' } } },
    },
  },
};
