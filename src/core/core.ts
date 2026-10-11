import { SharpEngine } from '../engine/sharp-engine.js';
import { SharpQualityEvaluator } from '../optimizer/sharp-evaluator.js';
import { BaseRasterCore } from './base-core.js';
import type { CoreLimits, RasterEngine } from './types.js';

export interface RasterCoreOptions {
  readonly engine?: RasterEngine;
  readonly limits?: Partial<CoreLimits>;
}

/** Node adapter; custom engines continue to work with the original API. */
export class RasterCore extends BaseRasterCore {
  constructor(options: RasterCoreOptions = {}) {
    super(options.engine ?? new SharpEngine(), new SharpQualityEvaluator(), options.limits);
  }
}

export function createRasterCore(options: RasterCoreOptions = {}): RasterCore {
  return new RasterCore(options);
}
