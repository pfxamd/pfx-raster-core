import { RasterError } from './errors.js';
import type { CoreLimits, ImageInfo, ProcessRequest, RasterFormat, ResizeKernel } from './types.js';

export const DEFAULT_LIMITS: Readonly<CoreLimits> = Object.freeze({
  maxInputBytes: 32 * 1024 * 1024,
  maxPixels: 64 * 1_000_000,
  maxOutputBytes: 64 * 1024 * 1024
});

export function resolveLimits(overrides: Partial<CoreLimits> = {}): CoreLimits {
  const merged = { ...DEFAULT_LIMITS, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RasterError('INVALID_REQUEST', key + ' must be a positive safe integer');
    }
  }
  return Object.freeze(merged);
}

export function copyAndCheckInput(data: Uint8Array, limits: CoreLimits): Uint8Array {
  if (!(data instanceof Uint8Array) || data.byteLength === 0) {
    throw new RasterError('INVALID_INPUT', 'A non-empty Uint8Array is required');
  }
  if (data.byteLength > limits.maxInputBytes) {
    throw new RasterError('INPUT_TOO_LARGE', 'Input exceeds maxInputBytes');
  }
  // Copy before the first await. Callers can mutate their own buffers safely.
  const copy = new Uint8Array(data);
  if (!hasSupportedSignature(copy)) {
    throw new RasterError('UNSUPPORTED_FORMAT', 'Only JPEG, PNG, WebP and AVIF still images are supported');
  }
  return copy;
}

function ascii(data: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...data.subarray(from, to));
}

function hasSupportedSignature(data: Uint8Array): boolean {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return true;
  if (data.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => data[i] === v)) return true;
  if (data.length >= 12 && ascii(data, 0, 4) === 'RIFF' && ascii(data, 8, 12) === 'WEBP') return true;
  if (data.length >= 16 && ascii(data, 4, 8) === 'ftyp') {
    const brands = ascii(data, 8, Math.min(data.length, 128));
    return brands.includes('avif') || brands.includes('avis');
  }
  return false;
}

export function validateInfo(info: ImageInfo, limits: CoreLimits): void {
  if (!Number.isSafeInteger(info.width) || !Number.isSafeInteger(info.height) || info.width < 1 || info.height < 1) {
    throw new RasterError('INVALID_INPUT', 'Image dimensions are missing or invalid');
  }
  if (info.width * info.height > limits.maxPixels) {
    throw new RasterError('PIXEL_LIMIT_EXCEEDED', 'Decoded image exceeds maxPixels');
  }
}

export function validateRequest(request: ProcessRequest): void {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new RasterError('INVALID_REQUEST', 'Request must be an object');
  }
  if (request.resize !== undefined) {
    if (!request.resize || typeof request.resize !== 'object' || Array.isArray(request.resize)) {
      throw new RasterError('INVALID_REQUEST', 'Resize must be an object');
    }
    const { width, height, kernel } = request.resize;
    if (width === undefined && height === undefined) {
      throw new RasterError('INVALID_REQUEST', 'At least one resize dimension is required');
    }
    for (const n of [width, height]) {
      if (n !== undefined && (!Number.isSafeInteger(n) || n <= 0)) {
        throw new RasterError('INVALID_REQUEST', 'Resize dimensions must be positive safe integers');
      }
    }
    const kernels: ReadonlyArray<ResizeKernel> = ['lanczos3', 'mks2021', 'mitchell', 'nearest'];
    if (kernel !== undefined && !kernels.includes(kernel)) {
      throw new RasterError('INVALID_REQUEST', 'Unsupported resize kernel');
    }
  }
  if (request.quality !== undefined && (!Number.isInteger(request.quality) || request.quality < 1 || request.quality > 100)) {
    throw new RasterError('INVALID_REQUEST', 'Quality must be an integer from 1 to 100');
  }
  if (request.lossless !== undefined && typeof request.lossless !== 'boolean') {
    throw new RasterError('INVALID_REQUEST', 'lossless must be a boolean');
  }
  if (request.colorProfile !== undefined && !['preserve', 'srgb'].includes(request.colorProfile)) {
    throw new RasterError('INVALID_REQUEST', 'Invalid colorProfile');
  }
  if (request.jpegBackground !== undefined && !/^#[0-9a-fA-F]{6}$/.test(request.jpegBackground)) {
    throw new RasterError('INVALID_REQUEST', 'jpegBackground must be a six-digit hex color');
  }
  const formats: ReadonlyArray<RasterFormat | 'auto'> = ['auto', 'jpeg', 'png', 'webp', 'avif'];
  if (request.format !== undefined && !formats.includes(request.format)) {
    throw new RasterError('INVALID_REQUEST', 'Unsupported output format');
  }
}
