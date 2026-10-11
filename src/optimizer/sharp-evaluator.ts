import sharp from 'sharp';
import { RasterError } from '../core/errors.js';
import { evaluateRgbaQuality } from './metric.js';

/**
 * Decode both outputs to matching sampled sRGB RGBA buffers, then enforce the
 * weaker of the global and salient local-detail similarity checks.
 * This changes optimization score semantics relative to alpha 0.4.0-alpha.2.
 */
export class SharpQualityEvaluator {
  async compare(reference: Uint8Array, candidate: Uint8Array, maxPixels: number): Promise<number> {
    const meta = await sharp(Buffer.from(reference)).metadata();
    if (!meta.width || !meta.height || meta.width * meta.height < 1) {
      throw new RasterError('OUTPUT_INVALID', 'Cannot inspect reference');
    }
    const scale = Math.min(1, Math.sqrt(maxPixels / (meta.width * meta.height)));
    const width = Math.max(1, Math.floor(meta.width * scale));
    const height = Math.max(1, Math.floor(meta.height * scale));
    const decode = async (data: Uint8Array): Promise<Uint8Array> => {
      const pipeline = sharp(Buffer.from(data), { limitInputPixels: 64_000_000, failOn: 'error' });
      const raw = await (scale < 1
        ? pipeline.resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
        : pipeline
      ).toColourspace('srgb').ensureAlpha().raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
      if (raw.info.width !== width || raw.info.height !== height || raw.info.channels !== 4) {
        throw new RasterError('OUTPUT_INVALID', 'Sampled image dimensions or channels differ');
      }
      return raw.data;
    };
    // Both images must match BEFORE scaling; never compare unrelated dimensions.
    const other = await sharp(Buffer.from(candidate)).metadata();
    if (other.width !== meta.width || other.height !== meta.height) {
      throw new RasterError('OUTPUT_INVALID', 'Candidate and reference dimensions differ');
    }
    return evaluateRgbaQuality(await decode(reference), await decode(candidate), width, height).score;
  }
}
