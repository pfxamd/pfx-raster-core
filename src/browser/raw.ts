import { RasterError } from '../core/errors.js';
import { copyAndCheckInput, resolveLimits, validateRequest } from '../core/validate.js';
import type { CoreLimits, ProcessRequest } from '../core/types.js';
import { decodeBitmap, makeCanvas } from './canvas.js';
import { inspectBrowserHeader } from './header.js';
import { resizeRgbaLanczos3 } from './resample.js';
import type { RawRaster } from './resample.js';

/**
 * Optional observational timing sink. Measures actual stages in the same
 * browser resize call; no logging, telemetry or format changes.
 */
export interface RawResizeStageTiming {
  readonly bitmapDecodeMs: number;
  readonly pixelExtractionMs: number;
  readonly resampleMs: number;
}

/**
 * Browser-native decode followed by explicit antialiased RGBA downsampling.
 * Returns pixels directly for caller-owned encoders without generating PNG.
 * ICC-tagged input requires explicit sRGB conversion consent.
 */
export async function resizeToRgba(
  input: Uint8Array,
  request: Pick<ProcessRequest, 'resize' | 'colorProfile'>,
  limits?: Partial<CoreLimits>,
  observe?: (timing: RawResizeStageTiming) => void
): Promise<RawRaster> {
  validateRequest(request);
  const resolved = resolveLimits(limits);
  const source = copyAndCheckInput(input, resolved);
  const header = inspectBrowserHeader(source);
  if (header.width * header.height > resolved.maxPixels) {
    throw new RasterError('PIXEL_LIMIT_EXCEEDED', 'Image exceeds maxPixels');
  }
  if (header.hasIccProfile && request.colorProfile !== 'srgb') {
    throw new RasterError('UNSUPPORTED_FORMAT',
      'Browser cannot preserve ICC profiles in raw pixels; explicitly request srgb');
  }
  const kernel = request.resize?.kernel ?? 'lanczos3';
  if (kernel !== 'nearest' && kernel !== 'lanczos3') {
    throw new RasterError('INVALID_REQUEST',
      'Raw browser resizing supports lanczos3 and nearest only');
  }
  const factor = Math.min(1,
    request.resize?.width === undefined ? 1 : request.resize.width / header.width,
    request.resize?.height === undefined ? 1 : request.resize.height / header.height);
  const width = Math.max(1, Math.min(header.width,
    request.resize?.width ?? header.width, Math.round(header.width * factor)));
  const height = Math.max(1, Math.min(header.height,
    request.resize?.height ?? header.height, Math.round(header.height * factor)));
  if (width * height > resolved.maxPixels) {
    throw new RasterError('PIXEL_LIMIT_EXCEEDED', 'Resized image exceeds maxPixels');
  }
  const decodeStarted = performance.now();
  const bitmap = await decodeBitmap(source, header.format);
  const bitmapDecodeMs = performance.now() - decodeStarted;
  try {
    if (bitmap.width !== header.width || bitmap.height !== header.height) {
      throw new RasterError('INVALID_INPUT', 'Incorrect oriented bitmap dimensions');
    }
    // Canvas first normalizes browser color-management to 8-bit sRGB.
    const pixelsStarted = performance.now();
    if (kernel === 'nearest') {
      const { ctx } = makeCanvas(width, height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bitmap, 0, 0, width, height);
      const data = new Uint8ClampedArray(
        ctx.getImageData(0, 0, width, height, { colorSpace: 'srgb' }).data);
      observe?.({ bitmapDecodeMs, pixelExtractionMs: performance.now() - pixelsStarted,
        resampleMs: 0 });
      return { width, height, data };
    }
    const { ctx } = makeCanvas(header.width, header.height);
    ctx.drawImage(bitmap, 0, 0);
    const decoded = ctx.getImageData(0, 0, header.width, header.height, { colorSpace: 'srgb' });
    const pixelExtractionMs = performance.now() - pixelsStarted;
    const resampleStarted = performance.now();
    const result = resizeRgbaLanczos3(decoded.data, header.width, header.height, width, height);
    observe?.({ bitmapDecodeMs, pixelExtractionMs, resampleMs: performance.now() - resampleStarted });
    return result;
  } finally {
    bitmap.close();
  }
}
