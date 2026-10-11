import { RasterError } from './errors.js';
import { validateRequest } from './validate.js';
import type { ImageInfo, ProcessPlan, ProcessRequest } from './types.js';

/** No crop, no automatic enlargement. All dimensions describe maximum bounds. */
export function planProcessing(info: ImageInfo, request: ProcessRequest = {}): ProcessPlan {
  validateRequest(request);
  const format = request.format && request.format !== 'auto' ? request.format : info.format;
  if (format === 'jpeg' && info.hasAlpha && request.jpegBackground === undefined) {
    throw new RasterError('INVALID_REQUEST', 'JPEG transparency loss requires an explicit jpegBackground');
  }
  if (request.jpegBackground !== undefined && format !== 'jpeg') {
    throw new RasterError('INVALID_REQUEST', 'jpegBackground is available for JPEG only');
  }
  if (request.quality !== undefined && (format === 'png' || request.lossless === true)) {
    throw new RasterError('INVALID_REQUEST', 'Quality is incompatible with lossless output');
  }
  if (request.lossless === true && format === 'jpeg') {
    throw new RasterError('INVALID_REQUEST', 'JPEG output is not lossless');
  }
  if (request.lossless === false && format === 'png') {
    throw new RasterError('INVALID_REQUEST', 'PNG output is lossless in this version');
  }
  const { width, height, kernel } = request.resize ?? {};
  const scaling = Math.min(width === undefined ? Infinity : width / info.width, height === undefined ? Infinity : height / info.height, 1);
  const shouldResize = scaling < 1;
  // Re-encoding should happen only when explicitly needed; avoid generational loss.
  const passthrough = !shouldResize && format === info.format && request.quality === undefined &&
    request.lossless === undefined && request.colorProfile !== 'srgb' && request.jpegBackground === undefined;

  return {
    format,
    ...(shouldResize && width !== undefined ? { maxWidth: width } : {}),
    ...(shouldResize && height !== undefined ? { maxHeight: height } : {}),
    resizeKernel: kernel ?? 'auto',
    ...(request.quality !== undefined ? { quality: request.quality } : {}),
    lossless: format === 'png' || request.lossless === true,
    ...(request.jpegBackground !== undefined ? { jpegBackground: request.jpegBackground } : {}),
    colorProfile: request.colorProfile ?? 'preserve',
    passthrough
  };
}
