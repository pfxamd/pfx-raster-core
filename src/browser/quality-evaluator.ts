import { RasterError } from '../core/errors.js';
import { evaluateRgbaQuality } from '../optimizer/metric.js';
import type { QualityEvaluator } from '../optimizer/search.js';
import { decodeRgba } from './canvas.js';
import { inspectBrowserHeader } from './header.js';

export class BrowserQualityEvaluator implements QualityEvaluator {
  async compare(reference: Uint8Array, candidate: Uint8Array, maxPixels: number): Promise<number> {
    const a = inspectBrowserHeader(reference);
    const b = inspectBrowserHeader(candidate);
    if (a.width !== b.width || a.height !== b.height) {
      throw new RasterError('OUTPUT_INVALID', 'Candidate and reference dimensions differ');
    }
    const scale = Math.min(1, Math.sqrt(maxPixels / (a.width * a.height)));
    const width = Math.max(1, Math.floor(a.width * scale));
    const height = Math.max(1, Math.floor(a.height * scale));
    const original = await decodeRgba(reference, a.format, width, height);
    const changed = await decodeRgba(candidate, b.format, width, height);
    return evaluateRgbaQuality(original, changed, width, height).score;
  }
}
