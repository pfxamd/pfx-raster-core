import { RasterError } from "../core/errors.js";
import type { CoreLimits, ImageInfo } from "../core/types.js";
import { resolveLimits, validateInfo } from "../core/validate.js";
import { inspectBrowserHeader } from "./header.js";

/**
 * Synchronous structural header inspection for still JPEG, PNG and WebP.
 *
 * Does not decode raster pixels, allocate an RGBA buffer, or copy the encoded
 * bytes. This is NOT equivalent to createRasterCore().inspect(), which also
 * uses the browser decoder to verify the pixel stream.
 *
 * Caller-supplied input is only read during this synchronous call.
 */
export function inspectRasterHeader(
  input: Uint8Array,
  limits?: Partial<CoreLimits>,
): ImageInfo {
  const resolved = resolveLimits(limits);
  if (!(input instanceof Uint8Array) || input.byteLength === 0) {
    throw new RasterError("INVALID_INPUT", "A non-empty Uint8Array is required");
  }
  if (input.byteLength > resolved.maxInputBytes) {
    throw new RasterError("INPUT_TOO_LARGE", "Input exceeds maxInputBytes");
  }
  const header = inspectBrowserHeader(input);
  const info: ImageInfo = { ...header, bytes: input.byteLength };
  validateInfo(info, resolved);
  return info;
}
