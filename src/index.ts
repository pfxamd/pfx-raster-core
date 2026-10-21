/**
 * ┌──────────────────────────────────────────────┐
 * │                                              │
 * │  PFxamd                                      │
 * │  Ahmed                                       │
 * │                                              │
 * └──────────────────────────────────────────────┘
 *
 * @project     PFx Raster Core
 * @author      Ahmed
 * @brand       PFxamd
 * @website     https://www.pfxamd.com
 * @repository  https://github.com/pfxamd/pfx-raster-core
 * @license     Apache-2.0
 */

export { createRasterCore, RasterCore } from './core/core.js';
export type { RasterCoreOptions } from './core/core.js';
export { RasterError } from './core/errors.js';
export type { RasterErrorCode } from './core/errors.js';
export { SharpEngine } from './engine/sharp-engine.js';
export type {
  CoreLimits, ImageInfo, ProcessPlan, ProcessRequest,
  ProcessResult, RasterEngine, RasterFormat, ResizeRequest, ResizeKernel
} from './core/types.js';

export { compareRgbaBlockSsim, evaluateRgbaQuality } from './optimizer/metric.js';
export type { RasterQualityScores } from './optimizer/metric.js';
export { optimizeRaster } from './optimizer/optimize.js';
export type { QualityEvaluator, OptimizationCore } from './optimizer/optimize.js';
export type { OptimizeRequest, OptimizeResult, OptimizationCandidate } from './optimizer/types.js';
