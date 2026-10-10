import { RasterError } from '../core/errors.js';
import { copyAndCheckInput, validateRequest } from '../core/validate.js';
import type { CoreLimits, ProcessRequest, ProcessResult, RasterFormat } from '../core/types.js';
import type { OptimizeRequest, OptimizeResult, OptimizationCandidate } from './types.js';
import { SharpQualityEvaluator } from './sharp-evaluator.js';

export interface OptimizationCore {
  readonly limits: CoreLimits;
  process(input: Uint8Array, request?: ProcessRequest): Promise<ProcessResult>;
}

/** The comparison adapter can be independently substituted in future engines. */
export interface QualityEvaluator {
  compare(reference: Uint8Array, candidate: Uint8Array, maxPixels: number): Promise<number>;
}

const DEFAULT_FORMATS: readonly RasterFormat[] = ['webp', 'avif', 'jpeg'];
const DEFAULT_QUALITIES: readonly number[] = [72, 84, 94];
const MAX_CANDIDATES = 16;
const DEFAULT_EVALUATION_PIXELS = 262_144;

function validatedOptions(request: OptimizeRequest): Required<Pick<OptimizeRequest,
  'formats' | 'qualities' | 'minScore' | 'maxEvaluationPixels' | 'colorProfile'>> {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new RasterError('INVALID_REQUEST', 'Optimization options must be an object');
  }
  validateRequest({ ...(request.resize === undefined ? {} : { resize: request.resize }),
    ...(request.colorProfile === undefined ? {} : { colorProfile: request.colorProfile }) });
  const formats = request.formats ?? DEFAULT_FORMATS;
  const qualities = request.qualities ?? DEFAULT_QUALITIES;
  if (!Array.isArray(formats) || formats.length < 1 ||
      formats.some(f => !['jpeg', 'png', 'webp', 'avif'].includes(f)) ||
      new Set(formats).size !== formats.length) {
    throw new RasterError('INVALID_REQUEST', 'formats must be a unique, non-empty list of supported formats');
  }
  if (!Array.isArray(qualities) || qualities.length < 1 ||
      qualities.some(q => !Number.isInteger(q) || q < 1 || q > 100) ||
      new Set(qualities).size !== qualities.length) {
    throw new RasterError('INVALID_REQUEST', 'qualities must contain unique integers from 1 to 100');
  }
  if (formats.length * qualities.length > MAX_CANDIDATES) {
    throw new RasterError('INVALID_REQUEST', 'Too many candidates; maximum formats * qualities is 16');
  }
  const minScore = request.minScore ?? 0.985;
  if (typeof minScore !== 'number' || !Number.isFinite(minScore) || minScore < 0 || minScore > 1) {
    throw new RasterError('INVALID_REQUEST', 'minScore must be between 0 and 1');
  }
  const maxEvaluationPixels = request.maxEvaluationPixels ?? DEFAULT_EVALUATION_PIXELS;
  if (!Number.isSafeInteger(maxEvaluationPixels) || maxEvaluationPixels < 64 || maxEvaluationPixels > 1_048_576) {
    throw new RasterError('INVALID_REQUEST', 'maxEvaluationPixels must be between 64 and 1048576');
  }
  return { formats, qualities, minScore, maxEvaluationPixels, colorProfile: request.colorProfile ?? 'preserve' };
}

/**
 * Search a bounded set of encodings for the smallest result passing the
 * caller-specified sampled image-similarity threshold.
 * Reference is a lossless, same-dimension PNG, not the differently sized input.
 */
export async function optimizeRaster(
  core: OptimizationCore, input: Uint8Array, request: OptimizeRequest = {},
  evaluator: QualityEvaluator = new SharpQualityEvaluator()
): Promise<OptimizeResult> {
  const opts = validatedOptions(request);
  // Snapshot user bytes once, before any async work or candidate iteration.
  const snapshot = copyAndCheckInput(input, core.limits);
  const transform = { ...(request.resize ? { resize: request.resize } : {}), colorProfile: opts.colorProfile };
  const reference = await core.process(snapshot, { ...transform, format: 'png' });
  const comparisons: OptimizationCandidate[] = [
    { format: 'png', bytes: reference.data.byteLength, score: 1, accepted: true, reason: 'reference' }
  ];
  let best = reference;
  let bestScore = 1;

  // If there was no downscaling or profile conversion, a source image is
  // already visually identical to its own decoded reference. Keep it when
  // smaller than a new PNG instead of re-encoding for no reason.
  if (!request.resize && opts.colorProfile === 'preserve') {
    const original = await core.process(snapshot);
    comparisons.push({
      format: original.output.format, bytes: original.data.byteLength,
      score: 1, accepted: true, reason: 'original'
    });
    if (original.data.byteLength <= best.data.byteLength) best = original;
  }

  const seen = new Set<string>();
  for (const format of opts.formats) {
    if (format === 'png') continue; // lossless reference already covers PNG
    if (format === 'jpeg' && reference.output.hasAlpha) continue;
    for (const quality of opts.qualities) {
      const key = format + ':' + quality;
      if (seen.has(key)) continue;
      seen.add(key);
      let candidate: ProcessResult;
      try {
        candidate = await core.process(snapshot, {
          ...transform, format, quality
        });
      } catch (error) {
        if (error instanceof RasterError &&
            (error.code === 'PROCESSING_FAILED' || error.code === 'OUTPUT_TOO_LARGE')) {
          comparisons.push({ format, quality, accepted: false, reason: 'encode-failed' });
          continue;
        }
        throw error;
      }
      const score = await evaluator.compare(reference.data, candidate.data, opts.maxEvaluationPixels);
      const passed = score >= opts.minScore;
      const smaller = candidate.data.byteLength < best.data.byteLength;
      comparisons.push({
        format, quality, bytes: candidate.data.byteLength, score,
        accepted: passed && smaller,
        ...(!passed ? { reason: 'below-threshold' as const } : !smaller ? { reason: 'not-smaller' as const } : {})
      });
      if (passed && smaller) {
        best = candidate;
        bestScore = score;
      }
    }
  }

  return { ...best, score: bestScore, referenceBytes: reference.data.byteLength,
    candidates: comparisons, metric: 'sampled-rgb-alpha-block-ssim-v1' };
}
