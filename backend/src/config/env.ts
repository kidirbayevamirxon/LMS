import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  APP_PUBLIC_URL: z.string().default('http://localhost:3000'),
  API_PUBLIC_URL: z.string().default('http://localhost:3001'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3001,capacitor://localhost,http://localhost,https://localhost'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(16).default('dev_access_secret_key_change_in_prod_2026'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev_refresh_secret_key_change_in_prod_2026'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().int().positive().default(30),
  FACE_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'FACE_ENCRYPTION_KEY must be 64 hex chars (32 bytes)')
    .default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(10),
  CLICK_MERCHANT_ID: z.string().optional().default(''),
  CLICK_SERVICE_ID: z.string().optional().default(''),
  CLICK_SECRET_KEY: z.string().optional().default(''),
  PAYME_MERCHANT_ID: z.string().optional().default(''),
  PAYME_SECRET_KEY: z.string().optional().default(''),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOriginList: parsed.data.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};
