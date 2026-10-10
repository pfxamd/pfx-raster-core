import { RasterError } from '../core/errors.js';

/**
 * Reference-relative sampled block SSIM for RGBA pixels.
 *
 * 8x8 nonoverlapping blocks, channel-wise SSIM on both black and white
 * backgrounds plus the original alpha channel. The weakest aggregate channel
 * score wins. This catches many visible artifacts but is NOT a validated
 * perceptual metric; thresholds are heuristics, especially for fine details.
 */
export function compareRgbaBlockSsim(reference: Uint8Array, candidate: Uint8Array, width: number, height: number): number {
  const expected = width * height * 4;
  if (!Number.isSafeInteger(expected) || width < 1 || height < 1 ||
      reference.byteLength !== expected || candidate.byteLength !== expected) {
    throw new RasterError('OUTPUT_INVALID', 'Metric inputs must be same-sized RGBA buffers');
  }

  const block = 8;
  const scores = new Float64Array(7);
  let blocks = 0;
  for (let top = 0; top < height; top += block) {
    for (let left = 0; left < width; left += block) {
      const right = Math.min(width, left + block);
      const bottom = Math.min(height, top + block);
      const count = (right - left) * (bottom - top);
      const sa = new Float64Array(7);
      const sb = new Float64Array(7);
      const saa = new Float64Array(7);
      const sbb = new Float64Array(7);
      const sab = new Float64Array(7);
      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
          const off = (y * width + x) * 4;
          const alphaA = reference[off + 3]!;
          const alphaB = candidate[off + 3]!;
          for (let c = 0; c < 7; c++) {
            const channel = c % 3;
            const a = c === 6 ? alphaA :
              (reference[off + channel]! * alphaA + (c >= 3 ? 255 * (255 - alphaA) : 0)) / 255;
            const b = c === 6 ? alphaB :
              (candidate[off + channel]! * alphaB + (c >= 3 ? 255 * (255 - alphaB) : 0)) / 255;
            sa[c]! += a;
            sb[c]! += b;
            saa[c]! += a * a;
            sbb[c]! += b * b;
            sab[c]! += a * b;
          }
        }
      }
      for (let c = 0; c < 7; c++) {
        const meanA = sa[c]! / count;
        const meanB = sb[c]! / count;
        const varianceA = Math.max(0, saa[c]! / count - meanA * meanA);
        const varianceB = Math.max(0, sbb[c]! / count - meanB * meanB);
        const covariance = sab[c]! / count - meanA * meanB;
        const numerator = (2 * meanA * meanB + 6.5025) * (2 * covariance + 58.5225);
        const denominator = (meanA * meanA + meanB * meanB + 6.5025) * (varianceA + varianceB + 58.5225);
        scores[c]! += Math.max(0, Math.min(1, numerator / denominator));
      }
      blocks++;
    }
  }
  return Math.min(...scores.map(v => v / blocks));
}
