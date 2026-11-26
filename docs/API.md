# EduManager REST API Documentation

Interactive Swagger UI is served at `/api/docs` (OpenAPI JSON at `/api/docs.json`).

## Authentication

All protected routes require `Authorization: Bearer <accessToken>`.

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public | Login with `phone` & `password`, returns JWT access + rotating refresh token |
| `POST` | `/api/auth/refresh` | Public | Rotate refresh token & issue new access token |
| `POST` | `/api/auth/logout` | Auth | Revoke refresh token |
| `GET` | `/api/auth/me` | Auth | Current user profile & role |
| `POST` | `/api/auth/fcm-token` | Auth | Register Firebase Cloud Messaging device token |

## Users & Roles

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/users` | Super Admin, Admin | List staff/users with role filter |
| `POST` | `/api/users` | Super Admin | Create Admin, Cashier, Teacher, or Super Admin |
| `PATCH` | `/api/users/:id` | Super Admin | Update user role or active status |
| `GET` | `/api/users/roles` | Super Admin, Admin | List all system roles |
| `GET` | `/api/users/teachers` | Super Admin, Admin | List teachers |

## Students

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/students` | Auth | Paginated list (`search`, `name`, `groupId`, `debtorsOnly`, `status`, `sort`) |
| `POST` | `/api/students` | Super Admin, Admin | Create student & auto-sync billing schedule |
| `GET` | `/api/students/:id` | Auth | Full student profile (personal, groups, payments, attendance, debts, certs, Face ID) |
| `PATCH` | `/api/students/:id` | Super Admin, Admin | Update student |
| `POST` | `/api/students/:id/photo` | Super Admin, Admin | Secure JPG/PNG/WEBP profile photo upload |
| `DELETE` | `/api/students/:id` | Super Admin, Admin | Delete student |
| `GET` | `/api/students/export/excel` | Staff | Download `.xlsx` workbook |
| `GET` | `/api/students/export/pdf` | Staff | Download `.pdf` student report |

## Courses & Groups

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/courses` | Auth | List courses |
| `POST` | `/api/courses` | Super Admin, Admin | Create course |
| `PATCH` | `/api/courses/:id` | Super Admin, Admin | Update course |
| `GET` | `/api/groups` | Auth | List groups (Teachers filtered to own groups) |
| `POST` | `/api/groups` | Super Admin, Admin | Create group |
| `GET` | `/api/groups/:id` | Auth | Group details & enrolled students |
| `PATCH` | `/api/groups/:id` | Super Admin, Admin | Update group |
| `POST` | `/api/groups/:id/students` | Super Admin, Admin | Enroll student (capacity check + billing sync) |
| `DELETE` | `/api/groups/:id/students/:studentId` | Super Admin, Admin | Remove student from group |
| `PATCH` | `/api/groups/:id/students/:studentId/result` | Admin, Teacher | Enter student score/grade |

## Monthly Payments & Receipts

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/payments` | Admin, Cashier | Paginated payments + Today/Monthly/Total revenue & debt stats |
| `POST` | `/api/payments` | Admin, Cashier | Accept full, partial, or advance payment (`CASH`, `CARD`, `BANK_TRANSFER`, `CLICK`, `PAYME`) |
| `GET` | `/api/payments/student/:studentId` | Auth | Student monthly payment schedule (`payment_months`) & transactions |
| `GET` | `/api/payments/debts` | Admin, Cashier | List all debtor students grouped with unpaid months count |
| `GET` | `/api/payments/monthly-report` | Admin, Cashier | Monthly revenue & collection breakdown |
| `POST` | `/api/payments/:id/cancel` | Admin, Cashier | Cancel payment & recalculate monthly debt |
| `POST` | `/api/payments/:id/refund` | Admin, Cashier | Refund payment & recalculate monthly debt |
| `GET` | `/api/payments/:id/receipt` | Auth | Structured receipt JSON |
| `GET` | `/api/payments/:id/receipt/pdf` | Auth | Printable PDF receipt |
| `POST` | `/api/payments/webhooks/click` | Provider | Click webhook handler |
| `POST` | `/api/payments/webhooks/payme` | Provider | Payme JSON-RPC handler |

## Attendance & Face ID

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/attendance` | Auth | List attendance (`date`, `groupId`, `status`) |
| `POST` | `/api/attendance` | Admin, Teacher | Mark manual attendance (prevents daily duplicate) |
| `GET` | `/api/attendance/student/:studentId` | Auth | Student attendance history & percentage |
| `POST` | `/api/face/register` | Super Admin, Admin | Encrypt (AES-256-GCM) & store MobileFaceNet embeddings |
| `POST` | `/api/face/recognize` | Admin, Teacher | Multi-face cosine similarity matching + auto-attendance (`PRESENT`/`LATE`) |
| `DELETE` | `/api/face/:studentId` | Super Admin, Admin | Delete student Face ID profile |

## Certificates

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/certificates/generate` | Super Admin, Admin | Generate certificate (unique per student + course) |
| `GET` | `/api/certificates` | Auth | List certificates |
| `GET` | `/api/certificates/:id` | Auth | Certificate details |
| `GET` | `/api/certificates/:id/pdf` | Auth | Landscape A4 PDF certificate with embedded QR code |
| `PATCH` | `/api/certificates/:id/status` | Super Admin, Admin | Issue or Revoke certificate |
| `GET` | `/api/certificates/verify/:number` | Public | Verify certificate authenticity via QR code |
