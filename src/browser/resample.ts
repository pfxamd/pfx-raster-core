import { RasterError } from '../core/errors.js';

/** Pixel-space, antialiased Lanczos3 downscale. RGB is filtered in sRGB.
 * Alpha is premultiplied before filtering to prevent transparent edge halos.
 * This is not a colorimetric, linear-light or HDR resampler.
 */
export interface RawRaster {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray<ArrayBuffer>;
}

interface Tap { readonly offset: number; readonly weight: number; }
const MAX_WORKING_PIXELS = 4_194_304; // At most 64 MiB per float RGBA intermediate.

function sinc(value: number): number {
  return value === 0 ? 1 : Math.sin(Math.PI * value) / (Math.PI * value);
}
function taps(input: number, output: number): Tap[][] {
  const ratio = input / output;
  const support = 3 * Math.max(1, ratio);
  const stretch = Math.max(1, ratio);
  const all: Tap[][] = [];
  for (let i = 0; i < output; i++) {
    const center = (i + 0.5) * ratio - 0.5;
    const weights: Tap[] = [];
    let total = 0;
    const from = Math.max(0, Math.ceil(center - support));
    const to = Math.min(input - 1, Math.floor(center + support));
    for (let j = from; j <= to; j++) {
      const distance = (j - center) / stretch;
      const weight = Math.abs(distance) < 3 ? sinc(distance) * sinc(distance / 3) : 0;
      if (weight === 0) continue;
      weights.push({ offset: j, weight });
      total += weight;
    }
    if (total === 0) throw new RasterError('PROCESSING_FAILED', 'Lanczos sampling produced no taps');
    all.push(weights.map(tap => ({ offset: tap.offset, weight: tap.weight / total })));
  }
  return all;
}
function pass(
  input: Uint8ClampedArray | Float32Array, sourceWidth: number, sourceHeight: number,
  outputWidth: number, outputHeight: number, horizontal: boolean, premultiplied: boolean
): Float32Array {
  const output = new Float32Array(outputWidth * outputHeight * 4);
  const kernels = taps(horizontal ? sourceWidth : sourceHeight,
    horizontal ? outputWidth : outputHeight);
  for (let y = 0; y < outputHeight; y++) {
    for (let x = 0; x < outputWidth; x++) {
      const weights = kernels[horizontal ? x : y]!;
      const dest = (y * outputWidth + x) * 4;
      let red = 0, green = 0, blue = 0, alpha = 0;
      for (const { offset, weight } of weights) {
        const src = ((horizontal ? y : offset) * sourceWidth +
          (horizontal ? offset : x)) * 4;
        const a = input[src + 3]!;
        const aFactor = premultiplied ? 1 : a / 255;
        red += input[src]! * aFactor * weight;
        green += input[src + 1]! * aFactor * weight;
        blue += input[src + 2]! * aFactor * weight;
        alpha += a * weight;
      }
      output[dest] = red;
      output[dest + 1] = green;
      output[dest + 2] = blue;
      output[dest + 3] = alpha;
    }
  }
  return output;
}

export function resizeRgbaLanczos3(
  source: Uint8ClampedArray, width: number, height: number,
  targetWidth: number, targetHeight: number
): RawRaster {
  if (![width, height, targetWidth, targetHeight].every(v => Number.isSafeInteger(v) && v > 0) ||
      targetWidth > width || targetHeight > height ||
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
  const first = pass(source, width, height, firstWidth, firstHeight, horizontalFirst, false);
  const second = pass(first, firstWidth, firstHeight,
    targetWidth, targetHeight, !horizontalFirst, true);
  const data = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < data.length; i += 4) {
    const alpha = Math.max(0, Math.min(255, second[i + 3]!));
    data[i + 3] = alpha;
    if (alpha > 0.000001) {
      const factor = 255 / alpha;
      data[i] = second[i]! * factor;
      data[i + 1] = second[i + 1]! * factor;
      data[i + 2] = second[i + 2]! * factor;
    } else {
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }
  return { width: targetWidth, height: targetHeight, data };
}
