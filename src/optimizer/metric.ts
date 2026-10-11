import { RasterError } from '../core/errors.js';

/** Interpretable components of the heuristic sampled quality check. */
export interface RasterQualityScores {
  /** Weakest mean RGB/alpha channel similarity across all 8x8 blocks (v1). */
  readonly globalScore: number;
  /** 5th percentile of per-block weakest channel similarity for salient blocks. */
  readonly localDetailScore: number;
  /** Both criteria must pass; reported score is their minimum. */
  readonly score: number;
  /** Number of contrast-bearing blocks used in the local check. */
  readonly detailedBlocks: number;
}

/**
 * RGB channels are evaluated against black and white backgrounds, plus alpha.
 * For detail protection, detect 8x8 reference blocks with channel variance >=
 * 100 (8-bit intensity squared), then use the 5th-percentile of their weakest
 * per-block channel scores. This is a robust local-artifact heuristic, not a
 * validated perceptual metric. Low-detail images fall back to the global score.
 *
 * Sampling happens upstream; this metric never looks for original-resolution
 * details already lost while making the comparison sample.
 */
export function evaluateRgbaQuality(
  reference: Uint8Array, candidate: Uint8Array, width: number, height: number
): RasterQualityScores {
  const expected = width * height * 4;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || !Number.isSafeInteger(expected) ||
      reference.byteLength !== expected || candidate.byteLength !== expected) {
    throw new RasterError('OUTPUT_INVALID', 'Metric inputs must be same-sized RGBA buffers');
  }

  const block = 8;
  const channelTotals = new Float64Array(7);
  const salientBlockScores: number[] = [];
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
      let weakest = 1;
      let strongestReferenceVariance = 0;
      for (let c = 0; c < 7; c++) {
        const meanA = sa[c]! / count;
        const meanB = sb[c]! / count;
        const varianceA = Math.max(0, saa[c]! / count - meanA * meanA);
        const varianceB = Math.max(0, sbb[c]! / count - meanB * meanB);
        const covariance = sab[c]! / count - meanA * meanB;
        const numerator = (2 * meanA * meanB + 6.5025) * (2 * covariance + 58.5225);
        const denominator = (meanA * meanA + meanB * meanB + 6.5025) *
          (varianceA + varianceB + 58.5225);
        const score = Math.max(0, Math.min(1, numerator / denominator));
        channelTotals[c]! += score;
        weakest = Math.min(weakest, score);
        strongestReferenceVariance = Math.max(strongestReferenceVariance, varianceA);
      }
      // Exclude incomplete edge blocks smaller than half a block.
      if (count >= 32 && strongestReferenceVariance >= 100) {
        salientBlockScores.push(weakest);
      }
      blocks++;
    }
  }
  const globalScore = Math.min(...channelTotals.map(v => v / blocks));
  // Require enough textured blocks for a stable percentile; otherwise the
  // local guard would overreact to a single naturally difficult small patch.
  let localDetailScore = globalScore;
  if (salientBlockScores.length >= 20) {
    salientBlockScores.sort((a, b) => a - b);
    localDetailScore = salientBlockScores[Math.floor((salientBlockScores.length - 1) * 0.05)]!;
  }
  return {
    globalScore,
    localDetailScore,
    score: Math.min(globalScore, localDetailScore),
    detailedBlocks: salientBlockScores.length
  };
}

/** Kept for users who explicitly need the legacy mean-channel-only score. */
export function compareRgbaBlockSsim(
  reference: Uint8Array, candidate: Uint8Array, width: number, height: number
): number {
  return evaluateRgbaQuality(reference, candidate, width, height).globalScore;
}
