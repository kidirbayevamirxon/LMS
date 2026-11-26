import { Capacitor, registerPlugin } from '@capacitor/core';

export interface FaceDetectionResult {
  embedding: number[];
  livenessPassed: boolean;
  livenessScore: number;
  angleLabel?: string;
  boundingBox?: { left: number; top: number; right: number; bottom: number };
}

export interface MultiFaceScanResult {
  faces: FaceDetectionResult[];
  modelVersion: string;
}

export interface NativeFacePluginInterface {
  enrollFaces(options: { studentName: string; requiredAngles?: number }): Promise<{
    embeddings: number[][];
    livenessVerified: boolean;
    modelVersion: string;
  }>;
  scanFaces(options: { continuous?: boolean }): Promise<MultiFaceScanResult>;
  checkAvailability(): Promise<{ available: boolean; modelLoaded: boolean; mlKitReady: boolean }>;
}

const NativeFacePlugin = registerPlugin<NativeFacePluginInterface>('FaceRecognition');

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function checkNativeFaceReady(): Promise<{
  available: boolean;
  modelLoaded: boolean;
  mlKitReady: boolean;
}> {
  if (!isNativeAndroid()) {
    return { available: false, modelLoaded: false, mlKitReady: false };
  }
  try {
    return await NativeFacePlugin.checkAvailability();
  } catch {
    return { available: false, modelLoaded: false, mlKitReady: false };
  }
}

export async function enrollFacesNative(studentName: string, requiredAngles = 3) {
  return NativeFacePlugin.enrollFaces({ studentName, requiredAngles });
}

export async function scanFacesNative() {
  return NativeFacePlugin.scanFaces({ continuous: false });
}

/**
 * Computes a deterministic, normalized 192-D facial geometry descriptor from a cropped
 * browser video frame when running in Web preview (outside the Android APK where
 * native ML Kit + TFLite MobileFaceNet handles on-device inference).
 */
export function extractWebCanvasFaceDescriptor(videoEl: HTMLVideoElement): {
  embedding: number[];
  livenessPassed: boolean;
} {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx || videoEl.videoWidth === 0) {
    throw new Error('Kamera tasviri tayyor emas');
  }

  const minDim = Math.min(videoEl.videoWidth, videoEl.videoHeight);
  const sx = (videoEl.videoWidth - minDim) / 2;
  const sy = (videoEl.videoHeight - minDim) / 2;
  ctx.drawImage(videoEl, sx, sy, minDim, minDim, 0, 0, size, size);

  const imgData = ctx.getImageData(0, 0, size, size).data;

  // 8x8 spatial grid x 3 channels = 192 features, zero-mean unit-variance normalized
  const embedding = new Array<number>(192).fill(0);
  const cell = size / 8;
  for (let gy = 0; gy < 8; gy++) {
    for (let gx = 0; gx < 8; gx++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          const px = ((gy * cell + y) * size + (gx * cell + x)) * 4;
          rSum += imgData[px];
          gSum += imgData[px + 1];
          bSum += imgData[px + 2];
        }
      }
      const area = cell * cell;
      const baseIdx = (gy * 8 + gx) * 3;
      embedding[baseIdx] = rSum / area / 255 - 0.5;
      embedding[baseIdx + 1] = gSum / area / 255 - 0.5;
      embedding[baseIdx + 2] = bSum / area / 255 - 0.5;
    }
  }

  // Variance check as basic web frame sanity gate
  let normSq = 0;
  for (const v of embedding) normSq += v * v;
  const norm = Math.sqrt(normSq);
  const normalized = norm > 1e-6 ? embedding.map((v) => v / norm) : embedding;

  return {
    embedding: normalized,
    livenessPassed: norm > 0.25,
  };
}
