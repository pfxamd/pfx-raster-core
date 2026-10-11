import { RasterError } from '../core/errors.js';
import type { RasterFormat } from '../core/types.js';

type Surface = OffscreenCanvas | HTMLCanvasElement;
type DrawContext = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export const MIME: Record<RasterFormat, string> = {
  jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif'
};

export function makeCanvas(width: number, height: number, alpha = true):
  { canvas: Surface; ctx: DrawContext } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha, colorSpace: 'srgb' });
    if (ctx) return { canvas, ctx };
  }
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha, colorSpace: 'srgb' });
    if (ctx) return { canvas, ctx };
  }
  throw new RasterError('PROCESSING_FAILED', 'A browser 2D canvas is required');
}

export async function decodeBitmap(data: Uint8Array, format: RasterFormat): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== 'function') {
    throw new RasterError('PROCESSING_FAILED', 'createImageBitmap is not available');
  }
  try {
    const blob = new Blob([new Uint8Array(data)], { type: MIME[format] });
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch (error) {
    throw new RasterError('INVALID_INPUT', 'Browser cannot decode this image', { cause: error });
  }
}

export async function encodeCanvas(
  canvas: Surface, format: RasterFormat, quality?: number
): Promise<Uint8Array> {
  const type = MIME[format];
  let blob: Blob;
  try {
    if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
      blob = await canvas.convertToBlob({ type, ...(quality === undefined ? {} : { quality: quality / 100 }) });
    } else {
      const html = canvas as HTMLCanvasElement;
      blob = await new Promise<Blob>((resolve, reject) => {
        html.toBlob(value => value ? resolve(value) :
          reject(new RasterError('PROCESSING_FAILED', 'Canvas encoding returned no image')),
          type, quality === undefined ? undefined : quality / 100);
      });
    }
  } catch (error) {
    if (error instanceof RasterError) throw error;
    throw new RasterError('PROCESSING_FAILED', 'Browser canvas encoding failed', { cause: error });
  }
  // Canvas encoders can silently fall back to PNG. Never mislabel output.
  if (blob.type.toLowerCase() !== type) {
    throw new RasterError('UNSUPPORTED_FORMAT', 'Browser does not support ' + type + ' encoding');
  }
  const data = new Uint8Array(await blob.arrayBuffer());
  if (data.length < 16) throw new RasterError('OUTPUT_INVALID', 'Empty browser encoding');
  return data;
}

export async function decodeRgba(
  data: Uint8Array, format: RasterFormat, width: number, height: number
): Promise<Uint8Array> {
  const bitmap = await decodeBitmap(data, format);
  try {
    const { ctx } = makeCanvas(width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    const raw = ctx.getImageData(0, 0, width, height).data;
    return new Uint8Array(raw);
  } finally {
    bitmap.close();
  }
}

export interface BrowserRasterCapabilities {
  readonly decoding: readonly RasterFormat[];
  readonly encoding: readonly RasterFormat[];
  readonly offscreenCanvas: boolean;
  readonly exactResamplingKernels: readonly string[];
  readonly preservesEmbeddedIccOnTransform: false;
  readonly guaranteesLosslessWebpOrAvif: false;
}

/** Probe actual encoder MIME outputs, never assume AVIF/WebP encoding works. */
export async function probeBrowserRasterCapabilities(): Promise<BrowserRasterCapabilities> {
  const offscreenCanvas = typeof OffscreenCanvas !== 'undefined';
  const { canvas } = makeCanvas(2, 2);
  const encoding: RasterFormat[] = [];
  for (const format of ['png', 'jpeg', 'webp'] as const) {
    try {
      await encodeCanvas(canvas, format, 85);
      encoding.push(format);
    } catch { /* Unsupported codec. */ }
  }
  return { decoding: ['png', 'jpeg', 'webp'], encoding, offscreenCanvas,
    exactResamplingKernels: ['nearest'],
    preservesEmbeddedIccOnTransform: false,
    guaranteesLosslessWebpOrAvif: false };
}
