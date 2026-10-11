import { BaseRasterCore } from './core/base-core.js';
import { BrowserEngine } from './browser/browser-engine.js';
import { BrowserQualityEvaluator } from './browser/quality-evaluator.js';
import { optimizeRasterWithEvaluator } from './optimizer/search.js';
import type { OptimizationCore, QualityEvaluator } from './optimizer/search.js';
import type { OptimizeRequest, OptimizeResult } from './optimizer/types.js';

import type { CoreLimits, RasterEngine } from './core/types.js';

export interface BrowserRasterCoreOptions {
  readonly engine?: RasterEngine;
  readonly evaluator?: QualityEvaluator;
  readonly limits?: Partial<CoreLimits>;
}

/**
 * Browser-specific entry point. The validation/search core is shared with Node,
 * but this module has no Sharp, Node.js built-in, or filesystem imports.
 */
export class RasterCore extends BaseRasterCore {
  constructor(options: BrowserRasterCoreOptions = {}) {
    super(options.engine ?? new BrowserEngine(),
      options.evaluator ?? new BrowserQualityEvaluator(), options.limits);
  }
}

export function createRasterCore(options: BrowserRasterCoreOptions = {}): RasterCore {
  return new RasterCore(options);
}

/** Browser equivalent of the Node optimizer function, with injectable evaluator. */
export function optimizeRaster(
  core: OptimizationCore, input: Uint8Array, request: OptimizeRequest = {},
  evaluator: QualityEvaluator = new BrowserQualityEvaluator()
): Promise<OptimizeResult> {
  return optimizeRasterWithEvaluator(core, input, request, evaluator);
}

export { BrowserEngine } from './browser/browser-engine.js';
export { resizeToRgba } from './browser/raw.js';
export { resizeRgbaLanczos3 } from './browser/resample.js';
export type { RawRaster } from './browser/resample.js';
export { BrowserQualityEvaluator } from './browser/quality-evaluator.js';
export { probeBrowserRasterCapabilities } from './browser/canvas.js';
export type { BrowserRasterCapabilities } from './browser/canvas.js';

export { RasterError } from './core/errors.js';
export type { RasterErrorCode } from './core/errors.js';
export type {
  CoreLimits, ImageInfo, ProcessPlan, ProcessRequest, ProcessResult,
  RasterEngine, RasterFormat, ResizeRequest, ResizeKernel
} from './core/types.js';
export type { QualityEvaluator, OptimizationCore } from './optimizer/search.js';
export type { OptimizeRequest, OptimizeResult, OptimizationCandidate } from './optimizer/types.js';
export { compareRgbaBlockSsim, evaluateRgbaQuality } from './optimizer/metric.js';
export type { RasterQualityScores } from './optimizer/metric.js';
