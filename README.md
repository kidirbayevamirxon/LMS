# EduManager — O‘quv markazi boshqaruv tizimi

**EduManager** — o‘quv markazlaridagi o‘quvchilar, kurslar, guruhlar, oylik to‘lovlar (vznos), Face ID orqali real-time davomat, QR-kodli sertifikatlar va bildirishnomalarni yagona tizimda boshqarish uchun mo‘ljallangan to‘liq ishlaydigan platforma.

## 1. Tizim Arxitekturasi

- **Android Mobile App (`mobile/`)**: Next.js 15 (App Router, `output: 'export'`), TypeScript (`.tsx`), Tailwind CSS (Material 3 Light/Dark theme, O‘zbek/Rus tillari) va **Capacitor 7** (`uz.edumanager.app`).
  - **Native Face Recognition Plugin**: Android Kotlin (`FaceRecognitionPlugin.kt`, `FaceScannerActivity.kt`, `MobileFaceNetRecognizer.kt`) — **CameraX** + **Google ML Kit Face Detection** (faqat yuzni aniqlash, burchaklar va liveness tekshiruvi) + **TensorFlow Lite (`mobilefacenet.tflite`)** (shaxsni aniqlash uchun 192-o‘lchamli yuz embeddingini hisoblash).
- **Backend API (`backend/`)**: Node.js 22, TypeScript, Express, Prisma ORM, PostgreSQL 17, JWT + Refresh Token rotation, AES-256-GCM Face ID shifrlash, ExcelJS & PDFKit eksport, QRCode PDF sertifikatlar, Swagger OpenAPI (`/api/docs`), Firebase Cloud Messaging (FCM) tayyor arxitekturasi.
- **Infrastructure**: Docker, Docker Compose (PostgreSQL, Redis, Backend, Frontend, Nginx reverse proxy + Let's Encrypt HTTPS).

## 2. Loyiha Tuzilishi

```text
LMS/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # 17 ta PostgreSQL jadvali (Decimal moliya, unique constraintlar)
│   │   └── seed.ts                # Rollar, foydalanuvchilar, kurslar, guruhlar, Aliyev Ali misoli
│   ├── src/
│   │   ├── config/                # env, prisma, swagger
│   │   ├── middleware/            # JWT auth, RBAC, Zod validation, Multer upload, error handler
│   │   ├── modules/               # auth, users, students, courses, groups, payments, attendance, face, certificates, dashboard, notifications, settings
│   │   ├── utils/                 # AES-256-GCM crypto, cosine similarity, audit logs, pagination
│   │   ├── app.ts
│   │   └── server.ts
│   ├── tests/api.test.ts          # Supertest + Vitest integratsion testlar
│   └── Dockerfile
├── mobile/
│   ├── src/
│   │   ├── app/                   # Dashboard, Students, Profile, Groups, Payments, Attendance, Certificates, Verify, Settings, Login
│   │   ├── components/            # AppShell (Material 3 Bottom Nav + Drawer), Charts, UiStates
│   │   ├── context/AppContext.tsx # Auth session, UZ/RU i18n, Dark/Light mode
│   │   └── lib/                   # api.ts, i18n.ts, face-plugin.ts
│   ├── android/                   # Capacitor Android loyihasi (uz.edumanager.app)
│   │   └── app/src/main/
│   │       ├── assets/mobilefacenet.tflite
│   │       └── java/uz/edumanager/app/
│   │           ├── MainActivity.java
│   │           ├── FaceRecognitionPlugin.kt
│   │           ├── FaceScannerActivity.kt
│   │           ├── FaceOverlayView.kt
│   │           └── MobileFaceNetRecognizer.kt
│   ├── capacitor.config.ts
│   └── Dockerfile
├── nginx/conf.d/                  # HTTP & HTTPS reverse proxy konfiguratsiyalari
├── scripts/                       # backup-db.sh, init-ssl.sh, deploy-vps.sh
├── docs/API.md
└── docker-compose.yml
```

## 3. Demo Akkauntlar (Seed)

Barcha demo akkauntlar uchun parol: `EduManager2026!`

| Rol | Telefon raqam | F.I.SH |
| :--- | :--- | :--- |
| Super Admin | `+998901000001` | Alisher Karimov |
| Administrator | `+998901000002` | Dilnoza Rakhimova |
| Kassir | `+998901000003` | Sardor Tursunov |
| O‘qituvchi | `+998901000004` | Jasur Bekmurodov |
| O‘quvchi | `+998901000006` | Aliyev Ali |

## 4. Ishga Tushirish Komandalari

### Docker Compose (Production / Full Stack)
```bash
cp .env.example .env
docker compose up -d --build
docker exec edumanager-backend npx prisma db seed
```
- Web Portal: `http://localhost:8088`
- Backend API & Swagger: `http://localhost:3001/api/docs`

### Backend Local Development
```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run dev
npm test
```

### Android APK Build
```bash
cd mobile
npm install
npm run cap:sync
cd android
./gradlew assembleDebug
./gradlew assembleRelease
```
Tayyor APK fayllari:
- Debug APK: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`
- Signed Release APK: `mobile/android/app/build/outputs/apk/release/app-release.apk`

### Ubuntu VPS & HTTPS (Let's Encrypt)
```bash
./scripts/deploy-vps.sh
./scripts/init-ssl.sh yourdomain.uz admin@yourdomain.uz
```

### Ma'lumotlar bazasi zaxira nusxasi (Backup)
```bash
./scripts/backup-db.sh
```

## 5. Tashqi Integratsiyalar Holati

- **Click / Payme**: To‘lov havolasi yaratish va webhook imzo tekshiruvi (`CLICK_SECRET_KEY`, `PAYME_SECRET_KEY`) arxitekturasi tayyor; jonli savdogar kalitlari `.env` ga kiritilganda ishga tushadi.
- **Firebase Cloud Messaging (FCM)**: Backend `firebase-admin` va Android `@capacitor/push-notifications` integratsiyasi tayyor; `.env` ga `FIREBASE_SERVICE_ACCOUNT_JSON` va `mobile/android/app/google-services.json` qo‘shilganda push bildirishnomalar faollashadi.
- **Browser WebRTC Face ID fallback**: Android APK da real ML Kit + TensorFlow Lite `mobilefacenet.tflite` ishlaydi; desktop brauzer rejimida test uchun Canvas descriptor fallback mavjud.
