import { RasterError } from '../core/errors.js';

/**
 * 8-bit sRGB Lanczos3 downscale. Premultiply alpha for convolution to prevent
 * transparent RGB halos. This is not linear-light colorimetric resampling.
 */
export interface RawRaster {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray<ArrayBuffer>;
}

interface FilterTaps {
  readonly offsets: Int32Array<ArrayBuffer>;
  readonly weights: Float64Array<ArrayBuffer>;
}

const MAX_WORKING_PIXELS = 4_194_304; // 64 MiB intermediate Float32 RGBA budget.

function sinc(value: number): number {
  return value === 0 ? 1 : Math.sin(Math.PI * value) / (Math.PI * value);
}

function taps(input: number, output: number): FilterTaps[] {
  const ratio = input / output;
  const support = 3 * Math.max(1, ratio);
  const stretch = Math.max(1, ratio);
  const all: FilterTaps[] = [];

  for (let i = 0; i < output; i++) {
    const center = (i + 0.5) * ratio - 0.5;
    const weights: number[] = [];
    const offsets: number[] = [];
    let total = 0;

    for (let j = Math.max(0, Math.ceil(center - support));
      j <= Math.min(input - 1, Math.floor(center + support)); j++) {
      const distance = (j - center) / stretch;
      const weight = Math.abs(distance) < 3 ? sinc(distance) * sinc(distance / 3) : 0;
      if (weight === 0) continue;
      offsets.push(j);
      weights.push(weight);
      total += weight;
    }
    if (total === 0) {
      throw new RasterError('PROCESSING_FAILED', 'Lanczos sampling produced no taps');
    }
    all.push({
      offsets: Int32Array.from(offsets),
      weights: Float64Array.from(weights, value => value / total)
    });
  }
  return all;
}

/**
 * Only the first pass needs a Float32 RGBA intermediate. The second writes
 * straight into final Uint8ClampedArray, removing an entire Float32 result
 * buffer. Precomputed typed taps also reduce inner-loop allocation/access.
 */
function pass(
  input: Uint8ClampedArray | Float32Array,
  sourceWidth: number, sourceHeight: number,
  outputWidth: number, outputHeight: number, horizontal: boolean,
  premultiplied: boolean, final: boolean
): Float32Array<ArrayBuffer> | Uint8ClampedArray<ArrayBuffer> {
  const output: Float32Array<ArrayBuffer> | Uint8ClampedArray<ArrayBuffer> = final
    ? new Uint8ClampedArray(outputWidth * outputHeight * 4)
    : new Float32Array(outputWidth * outputHeight * 4);
  const kernels = taps(horizontal ? sourceWidth : sourceHeight,
    horizontal ? outputWidth : outputHeight);

  for (let y = 0; y < outputHeight; y++) {
    for (let x = 0; x < outputWidth; x++) {
      const kernel = kernels[horizontal ? x : y]!;
      const { offsets, weights } = kernel;
      const dest = (y * outputWidth + x) * 4;
      let red = 0, green = 0, blue = 0, alpha = 0;

      for (let k = 0; k < weights.length; k++) {
        const offset = ((horizontal ? y : offsets[k]!) * sourceWidth +
          (horizontal ? offsets[k]! : x)) * 4;
        const a = input[offset + 3]!;
        const weight = weights[k]!;
        const premultipliedWeight = premultiplied ? weight : weight * a / 255;
        red += input[offset]! * premultipliedWeight;
        green += input[offset + 1]! * premultipliedWeight;
        blue += input[offset + 2]! * premultipliedWeight;
        alpha += a * weight;
      }

      if (final) {
        const a = Math.max(0, Math.min(255, alpha));
        output[dest + 3] = a;
        if (a > 0.000001) {
          const factor = 255 / a;
          output[dest] = red * factor;
          output[dest + 1] = green * factor;
          output[dest + 2] = blue * factor;
        }
      } else {
        output[dest] = red;
        output[dest + 1] = green;
        output[dest + 2] = blue;
        output[dest + 3] = alpha;
      }
    }
  }
  return output;
}

export function resizeRgbaLanczos3(
  source: Uint8ClampedArray, width: number, height: number,
  targetWidth: number, targetHeight: number
): RawRaster {
  if (![width, height, targetWidth, targetHeight].every(
    value => Number.isSafeInteger(value) && value > 0
  ) || targetWidth > width || targetHeight > height ||
      source.length !== width * height * 4) {
    throw new RasterError('INVALID_REQUEST', 'Lanczos3 requires valid RGBA and no enlargement');
  }

  const pixels = targetWidth * targetHeight;
  const intermediatePixels = Math.min(targetWidth * height, width * targetHeight);
  if (pixels > MAX_WORKING_PIXELS || intermediatePixels > MAX_WORKING_PIXELS) {
    throw new RasterError('PIXEL_LIMIT_EXCEEDED', 'Lanczos3 exceeds browser working pixel budget');
  }
  if (width === targetWidth && height === targetHeight) {
    return { width, height, data: new Uint8ClampedArray(source) };
  }

  const horizontalFirst = targetWidth * height <= width * targetHeight;
  const firstWidth = horizontalFirst ? targetWidth : width;
  const firstHeight = horizontalFirst ? height : targetHeight;
  const first = pass(source, width, height, firstWidth, firstHeight,
    horizontalFirst, false, false) as Float32Array<ArrayBuffer>;
  const data = pass(first, firstWidth, firstHeight, targetWidth, targetHeight,
    !horizontalFirst, true, true) as Uint8ClampedArray<ArrayBuffer>;
  return { width: targetWidth, height: targetHeight, data };
}
