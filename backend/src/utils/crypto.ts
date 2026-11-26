import crypto from 'crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';

function getKeyBuffer(): Buffer {
  return Buffer.from(env.FACE_ENCRYPTION_KEY, 'hex');
}

export interface EncryptedPayload {
  encryptedEmbedding: string;
  iv: string;
  authTag: string;
}

/**
 * Encrypts numeric face embedding vectors at rest using AES-256-GCM.
 */
export function encryptEmbeddingData(data: unknown): EncryptedPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKeyBuffer(), iv);
  const json = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedEmbedding: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/**
 * Decrypts AES-256-GCM face embedding vectors stored in PostgreSQL.
 */
export function decryptEmbeddingData<T>(payload: EncryptedPayload): T {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKeyBuffer(),
    Buffer.from(payload.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.encryptedEmbedding, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8')) as T;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function l2Normalize(vec: number[]): number[] {
  let normSq = 0;
  for (let i = 0; i < vec.length; i++) {
    normSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(normSq);
  if (norm < 1e-12) return vec.slice();
  return vec.map((v) => v / norm);
}

export function computeCentroid(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dim = vectors[0].length;
  const sum = new Array<number>(dim).fill(0);
  for (const rawVec of vectors) {
    const vec = l2Normalize(rawVec);
    for (let i = 0; i < dim; i++) {
      sum[i] += vec[i];
    }
  }
  return l2Normalize(sum.map((s) => s / vectors.length));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return -1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom < 1e-12) return -1;
  return dot / denom;
}
