import { BaseRasterCore } from './core/base-core.js';
import { RasterError } from './core/errors.js';
import { BrowserEngine } from './browser/browser-engine.js';
import { BrowserQualityEvaluator } from './browser/quality-evaluator.js';

import type { CoreLimits, RasterEngine } from './core/types.js';
import type { QualityEvaluator } from './optimizer/search.js';

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

export { BrowserEngine } from './browser/browser-engine.js';
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
