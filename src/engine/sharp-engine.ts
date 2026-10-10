import sharp from 'sharp';
import { RasterError } from '../core/errors.js';
import type { CoreLimits, ImageInfo, ProcessPlan, RasterEngine, RasterFormat } from '../core/types.js';

const FORMATS: ReadonlyArray<string> = ['jpeg', 'png', 'webp', 'avif'];

function reader(data: Uint8Array, limits: CoreLimits) {
  return sharp(Buffer.from(data), {
    limitInputPixels: limits.maxPixels,
    failOn: 'error',
    animated: false
  });
}

export class SharpEngine implements RasterEngine {
  async inspect(data: Uint8Array, limits: CoreLimits): Promise<Omit<ImageInfo, 'bytes'>> {
    try {
      const meta = await reader(data, limits).metadata();
      // Sharp/libvips identify AVIF as a HEIF container using AV1 compression.
      const decodedFormat = meta.format === 'heif' && meta.compression === 'av1' ? 'avif' : meta.format;
      if (!decodedFormat || !FORMATS.includes(decodedFormat)) {
        throw new RasterError('UNSUPPORTED_FORMAT', 'Unsupported decoded raster format');
      }
      if ((meta.pages ?? 1) > 1) {
        throw new RasterError('UNSUPPORTED_ANIMATION', 'Multi-frame and animated images are not supported');
      }
      if (!meta.width || !meta.height) {
        throw new RasterError('INVALID_INPUT', 'Image dimensions are missing');
      }
      const orientation = meta.orientation ?? 1;
      const swapped = orientation >= 5 && orientation <= 8;
      return {
        format: decodedFormat as RasterFormat,
        width: swapped ? meta.height : meta.width,
        height: swapped ? meta.width : meta.height,
        hasAlpha: meta.hasAlpha ?? false,
        hasIccProfile: !!meta.icc,
        orientation
      };
    } catch (error) {
      if (error instanceof RasterError) throw error;
      throw new RasterError('INVALID_INPUT', 'Image could not be decoded safely', { cause: error });
    }
  }

  async transform(data: Uint8Array, plan: ProcessPlan, limits: CoreLimits): Promise<Uint8Array> {
    try {
      let pipeline = reader(data, limits).autoOrient();
      if (plan.maxWidth || plan.maxHeight) {
        pipeline = pipeline.resize({
          ...(plan.maxWidth ? { width: plan.maxWidth } : {}),
          ...(plan.maxHeight ? { height: plan.maxHeight } : {}),
          fit: 'inside',
          withoutEnlargement: true,
          // libvips handles premultiplication around Sharp's resize pipeline.
          kernel: plan.resizeKernel
        });
      }
      if (plan.jpegBackground !== undefined) {
        pipeline = pipeline.flatten({ background: plan.jpegBackground });
      }
      pipeline = plan.colorProfile === 'srgb'
        ? pipeline.withIccProfile('srgb')
        : pipeline.keepIccProfile();

      switch (plan.format) {
        case 'jpeg': pipeline = pipeline.jpeg({ quality: plan.quality ?? 85, mozjpeg: true }); break;
        case 'png': pipeline = pipeline.png({ compressionLevel: 9 }); break;
        case 'webp': pipeline = pipeline.webp({ lossless: plan.lossless, ...(!plan.lossless ? { quality: plan.quality ?? 85 } : {}) }); break;
        case 'avif': pipeline = pipeline.avif({ lossless: plan.lossless, ...(!plan.lossless ? { quality: plan.quality ?? 85 } : {}) }); break;
      }
      const output = await pipeline.toBuffer();
      if (output.byteLength > limits.maxOutputBytes) {
        throw new RasterError('OUTPUT_TOO_LARGE', 'Output exceeds maxOutputBytes');
      }
      return new Uint8Array(output);
    } catch (error) {
      if (error instanceof RasterError) throw error;
      throw new RasterError('PROCESSING_FAILED', 'Image processing failed', { cause: error });
    }
  }
}
