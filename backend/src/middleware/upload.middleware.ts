import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function ensureUploadSubdir(subdir: string): string {
  const dirPath = path.resolve(process.cwd(), env.UPLOAD_DIR, subdir);
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function createImageUploader(subdir: string) {
  const dest = ensureUploadSubdir(subdir);
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dest),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
      cb(null, `${crypto.randomUUID()}${safeExt}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
        cb(new AppError('Faqat JPG, PNG yoki WEBP rasm yuklash mumkin', 400, 'INVALID_FILE_TYPE'));
        return;
      }
      cb(null, true);
    },
  });
}
