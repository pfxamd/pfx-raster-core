import { RasterError } from '../core/errors.js';
import type { CoreLimits, ImageInfo, ProcessPlan, RasterEngine } from '../core/types.js';
import { decodeBitmap, encodeCanvas, makeCanvas } from './canvas.js';
import { inspectBrowserHeader } from './header.js';
import { resizeToRgba } from './raw.js';

export class BrowserEngine implements RasterEngine {
  async inspect(data: Uint8Array, limits: CoreLimits): Promise<Omit<ImageInfo, 'bytes'>> {
    const header = inspectBrowserHeader(data);
    if (header.width < 1 || header.height < 1 ||
        header.width * header.height > limits.maxPixels) {
      throw new RasterError('PIXEL_LIMIT_EXCEEDED', 'Input exceeds maxPixels before browser decode');
    }
    const bitmap = await decodeBitmap(data, header.format);
    try {
      if (bitmap.width !== header.width || bitmap.height !== header.height) {
        throw new RasterError('INVALID_INPUT',
          'Browser dimensions disagree with verified header/orientation');
      }
    } finally {
      bitmap.close();
    }
    return header;
  }

  async transform(data: Uint8Array, plan: ProcessPlan, limits: CoreLimits): Promise<Uint8Array> {
    const header = inspectBrowserHeader(data);
    if (header.width < 1 || header.height < 1 ||
        header.width * header.height > limits.maxPixels) {
      throw new RasterError('PIXEL_LIMIT_EXCEEDED', 'Input exceeds maxPixels before browser decode');
    }
    if (plan.format === 'avif') {
      throw new RasterError('UNSUPPORTED_FORMAT', 'AVIF encoding requires a separate verified codec');
    }
    if (plan.lossless && plan.format !== 'png') {
      throw new RasterError('UNSUPPORTED_FORMAT',
        'Canvas cannot guarantee lossless WebP or AVIF encoding');
    }
    if (plan.resizeKernel !== 'auto' && plan.resizeKernel !== 'nearest' &&
        plan.resizeKernel !== 'lanczos3' &&
        (plan.maxWidth !== undefined || plan.maxHeight !== undefined)) {
      throw new RasterError('INVALID_REQUEST',
        'Browser native canvas cannot guarantee the explicitly requested resampling kernel');
    }
    if (header.hasIccProfile && plan.colorProfile === 'preserve') {
      throw new RasterError('UNSUPPORTED_FORMAT',
        'Browser canvas cannot guarantee embedded ICC preservation; choose colorProfile: srgb explicitly');
    }
    const factor = Math.min(
      1,
      plan.maxWidth === undefined ? 1 : plan.maxWidth / header.width,
      plan.maxHeight === undefined ? 1 : plan.maxHeight / header.height
    );
    // Rounded dimensions match the requested bounds; no crop/no enlargement.
    const width = Math.max(1, Math.min(header.width, Math.round(header.width * factor),
      plan.maxWidth ?? header.width));
    const height = Math.max(1, Math.min(header.height, Math.round(header.height * factor),
      plan.maxHeight ?? header.height));
    if (width * height > limits.maxPixels) {
      throw new RasterError('PIXEL_LIMIT_EXCEEDED', 'Output exceeds maxPixels');
    }
    const bitmap = await decodeBitmap(data, header.format);
    try {
      if (bitmap.width !== header.width || bitmap.height !== header.height) {
        throw new RasterError('INVALID_INPUT', 'Incorrect decoded image dimensions/orientation');
      }
      const { canvas, ctx } = makeCanvas(width, height,
        plan.format === 'jpeg' ? false : header.hasAlpha);
      // Opaque JPEG conversion from alpha requires an explicit flatten color.
      if (plan.jpegBackground !== undefined) {
        ctx.fillStyle = plan.jpegBackground;
        ctx.fillRect(0, 0, width, height);
      }
      if (factor < 1 && (plan.resizeKernel === 'auto' || plan.resizeKernel === 'lanczos3')) {
        const raw = await resizeToRgba(data, {
          resize: {
            ...(plan.maxWidth === undefined ? {} : { width: plan.maxWidth }),
            ...(plan.maxHeight === undefined ? {} : { height: plan.maxHeight }),
            kernel: 'lanczos3'
          },
          colorProfile: plan.colorProfile
        }, limits);
        // putImageData replaces pixels rather than alpha-compositing them.
        // Render through an RGBA surface to preserve JPEG flatten background.
        const intermediate = makeCanvas(width, height);
        intermediate.ctx.putImageData(new ImageData(raw.data, width, height), 0, 0);
        ctx.drawImage(intermediate.canvas, 0, 0);
      } else {
        ctx.imageSmoothingEnabled = plan.resizeKernel !== 'nearest';
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bitmap, 0, 0, width, height);
      }
      const output = await encodeCanvas(canvas, plan.format, plan.quality);
      if (output.byteLength > limits.maxOutputBytes) {
        throw new RasterError('OUTPUT_TOO_LARGE', 'Browser output exceeds maxOutputBytes');
      }
      return output;
    } finally {
      bitmap.close();
    }
  }
}
