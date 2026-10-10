import { SharpEngine } from '../engine/sharp-engine.js';
import { RasterError } from './errors.js';
import { planProcessing } from './plan.js';
import { copyAndCheckInput, resolveLimits, validateInfo } from './validate.js';
import type { CoreLimits, ImageInfo, ProcessRequest, ProcessResult, RasterEngine } from './types.js';

export interface RasterCoreOptions {
  readonly engine?: RasterEngine;
  readonly limits?: Partial<CoreLimits>;
}

export class RasterCore {
  readonly limits: CoreLimits;
  private readonly engine: RasterEngine;

  constructor(options: RasterCoreOptions = {}) {
    this.limits = resolveLimits(options.limits);
    this.engine = options.engine ?? new SharpEngine();
  }

  private async inspectCopy(data: Uint8Array): Promise<ImageInfo> {
    const info = await this.engine.inspect(data, this.limits);
    const withBytes = { ...info, bytes: data.byteLength };
    validateInfo(withBytes, this.limits);
    return withBytes;
  }

  async inspect(input: Uint8Array): Promise<ImageInfo> {
    const copy = copyAndCheckInput(input, this.limits);
    return this.inspectCopy(copy);
  }

  async process(input: Uint8Array, request: ProcessRequest = {}): Promise<ProcessResult> {
    const copy = copyAndCheckInput(input, this.limits);
    const original = await this.inspectCopy(copy);
    const plan = planProcessing(original, request);
    if (plan.passthrough) {
      if (copy.byteLength > this.limits.maxOutputBytes) {
        throw new RasterError('OUTPUT_TOO_LARGE', 'Output exceeds maxOutputBytes');
      }
      return { data: copy, original, output: original, passthrough: true };
    }

    const result = await this.engine.transform(copy, plan, this.limits);
    if (!(result instanceof Uint8Array) || result.length === 0) {
      throw new RasterError('OUTPUT_INVALID', 'Engine returned an empty or invalid result');
    }
    if (result.byteLength > this.limits.maxOutputBytes) {
      throw new RasterError('OUTPUT_TOO_LARGE', 'Output exceeds maxOutputBytes');
    }
    const checked = copyAndCheckInput(result, { ...this.limits, maxInputBytes: this.limits.maxOutputBytes });
    const output = await this.inspectCopyOutput(checked);
    if (output.format !== plan.format || output.hasAlpha && plan.format === 'jpeg') {
      throw new RasterError('OUTPUT_INVALID', 'Output encoding or transparency does not match the plan');
    }
    if (plan.maxWidth !== undefined && output.width > plan.maxWidth ||
        plan.maxHeight !== undefined && output.height > plan.maxHeight) {
      throw new RasterError('OUTPUT_INVALID', 'Output exceeds the requested bounds');
    }
    if (output.width > original.width || output.height > original.height) {
      throw new RasterError('OUTPUT_INVALID', 'Unexpected image enlargement');
    }
    return { data: checked, original, output, passthrough: false };
  }

  private async inspectCopyOutput(data: Uint8Array): Promise<ImageInfo> {
    const info = await this.engine.inspect(data, this.limits);
    const output = { ...info, bytes: data.byteLength };
    validateInfo(output, this.limits);
    return output;
  }
}

export function createRasterCore(options: RasterCoreOptions = {}): RasterCore {
  return new RasterCore(options);
}
