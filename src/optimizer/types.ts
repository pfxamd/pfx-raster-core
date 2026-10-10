import type { ProcessResult, RasterFormat, ResizeRequest } from '../core/types.js';

export interface OptimizeRequest {
  /** Optional maximum output bounds. No crop or enlargement. */
  readonly resize?: ResizeRequest;
  /** Encoders to compare; JPEG is automatically excluded for images with alpha. */
  readonly formats?: readonly RasterFormat[];
  /** Candidate lossy encoder quality values. */
  readonly qualities?: readonly number[];
  /** Minimum measured, reference-relative block SSIM score (0..1). */
  readonly minScore?: number;
  /** ICC handling, matching core.process(). */
  readonly colorProfile?: 'preserve' | 'srgb';
  /** Cap sampled pixels used for comparisons; default 262144. */
  readonly maxEvaluationPixels?: number;
}

export interface OptimizationCandidate {
  readonly format: RasterFormat;
  /** Absent for lossless reference or original source. */
  readonly quality?: number;
  readonly bytes?: number;
  /** Reference-relative sampled RGB/alpha block SSIM. */
  readonly score?: number;
  readonly accepted: boolean;
  readonly reason?: 'reference' | 'original' | 'below-threshold' | 'not-smaller' | 'encode-failed';
}

export interface OptimizeResult extends ProcessResult {
  readonly score: number;
  /** Raw lossless reference file bytes, not original encoded size. */
  readonly referenceBytes: number;
  readonly candidates: readonly OptimizationCandidate[];
  readonly metric: 'sampled-rgb-alpha-block-ssim-v1';
}
