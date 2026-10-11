import { SharpQualityEvaluator } from './sharp-evaluator.js';
import { optimizeRasterWithEvaluator } from './search.js';
import type { OptimizationCore, QualityEvaluator } from './search.js';
import type { OptimizeRequest, OptimizeResult } from './types.js';

export type { OptimizationCore, QualityEvaluator } from './search.js';

/** Node-compatible wrapper preserving the existing public API and evaluator injection. */
export function optimizeRaster(
  core: OptimizationCore, input: Uint8Array, request: OptimizeRequest = {},
  evaluator: QualityEvaluator = new SharpQualityEvaluator()
): Promise<OptimizeResult> {
  return optimizeRasterWithEvaluator(core, input, request, evaluator);
}
