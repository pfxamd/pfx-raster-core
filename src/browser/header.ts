import { RasterError } from '../core/errors.js';
import type { RasterFormat } from '../core/types.js';

export interface RasterHeader {
  readonly format: RasterFormat;
  /** Display-oriented width and height. */
  readonly width: number;
  readonly height: number;
  readonly orientation: number;
  readonly hasAlpha: boolean;
  readonly hasIccProfile: boolean;
}

const ascii = (b: Uint8Array, p: number, n: number) =>
  String.fromCharCode(...b.subarray(p, p + n));
const be32 = (b: Uint8Array, p: number) =>
  ((b[p]! * 0x1000000) + (b[p + 1]! << 16) +
    (b[p + 2]! << 8) + b[p + 3]!);
const le32 = (b: Uint8Array, p: number) =>
  ((b[p]! + (b[p + 1]! * 0x100) + (b[p + 2]! * 0x10000) +
    b[p + 3]! * 0x1000000) >>> 0);

function invalid(message: string): never {
  throw new RasterError('INVALID_INPUT', message);
}

/** Only the small, widely understood EXIF orientation TIFF field is read. */
function exifOrientation(b: Uint8Array, from: number, length: number): number {
  if (length < 8) return 1;
  const end = from + length;
  if (end > b.length) return 1;
  const order = ascii(b, from, 2);
  if (order !== 'II' && order !== 'MM') return 1;
  const little = order === 'II';
  const read16 = (p: number) => little
    ? b[p]! | b[p + 1]! << 8
    : (b[p]! << 8) | b[p + 1]!;
  const read32 = (p: number) => little
    ? le32(b, p) : be32(b, p);
  if (read16(from + 2) !== 42) return 1;
  const directory = from + read32(from + 4);
  if (directory < from + 8 || directory + 2 > end) return 1;
  const count = Math.min(read16(directory), 100);
  for (let i = 0; i < count; i++) {
    const p = directory + 2 + i * 12;
    if (p + 12 > end) break;
    if (read16(p) === 0x0112 && read16(p + 2) === 3 && read32(p + 4) === 1) {
      const value = read16(p + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

function png(b: Uint8Array): RasterHeader {
  if (b.length < 33 || ascii(b, 12, 4) !== 'IHDR' || be32(b, 8) !== 13) {
    return invalid('Invalid PNG IHDR');
  }
  const width = be32(b, 16);
  const height = be32(b, 20);
  const colorType = b[25]!;
  if (![0, 2, 3, 4, 6].includes(colorType)) invalid('Unsupported PNG color type');
  let hasAlpha = colorType === 4 || colorType === 6;
  let hasIccProfile = false;
  let offset = 8;
  let orientation = 1;
  let ended = false;
  while (offset + 12 <= b.length) {
    const len = be32(b, offset);
    const next = offset + 12 + len;
    if (next > b.length || next < offset) invalid('Truncated PNG chunk');
    const kind = ascii(b, offset + 4, 4);
    if (kind === 'iCCP') hasIccProfile = true;
    if (kind === 'tRNS') hasAlpha = true;
    if (kind === 'acTL') throw new RasterError('UNSUPPORTED_ANIMATION', 'Animated PNG is unsupported');
    if (kind === 'eXIf') orientation = exifOrientation(b, offset + 8, len);
    offset = next;
    if (kind === 'IEND') { ended = true; break; }
  }
  if (!ended) invalid('PNG IEND chunk missing');
  if (orientation !== 1) {
    throw new RasterError('UNSUPPORTED_FORMAT', 'PNG eXIf orientation requires a separate verified decoder');
  }
  return { format: 'png', width, height, orientation, hasAlpha, hasIccProfile };
}

function jpeg(b: Uint8Array): RasterHeader {
  let p = 2;
  let width = 0;
  let height = 0;
  let orientation = 1;
  let hasIccProfile = false;
  while (p + 3 < b.length) {
    if (b[p] !== 0xff) invalid('Malformed JPEG marker');
    while (b[p] === 0xff) p++;
    const marker = b[p++]!;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
    if (p + 2 > b.length) invalid('Truncated JPEG marker length');
    const length = (b[p]! << 8) | b[p + 1]!;
    if (length < 2 || p + length > b.length) invalid('Truncated JPEG segment');
    const data = p + 2;
    const end = p + length;
    if (marker === 0xe1 && end - data >= 6 && ascii(b, data, 6) === 'Exif\0\0') {
      orientation = exifOrientation(b, data + 6, end - data - 6);
    }
    if (marker === 0xe2 && end - data >= 11 && ascii(b, data, 11) === 'ICC_PROFILE') {
      hasIccProfile = true;
    }
    // SOF markers that include width and height.
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      if (end - data < 5) invalid('Malformed JPEG SOF');
      height = (b[data + 1]! << 8) | b[data + 2]!;
      width = (b[data + 3]! << 8) | b[data + 4]!;
    }
    p = end;
  }
  if (width < 1 || height < 1) invalid('JPEG dimensions missing');
  const swap = orientation >= 5 && orientation <= 8;
  return { format: 'jpeg', width: swap ? height : width,
    height: swap ? width : height, orientation, hasAlpha: false, hasIccProfile };
}

function webp(b: Uint8Array): RasterHeader {
  if (b.length < 20) invalid('WebP header truncated');
  const declared = le32(b, 4) + 8;
  if (declared > b.length || declared < 20) invalid('Truncated WebP RIFF');
  let p = 12;
  let width = 0;
  let height = 0;
  let hasAlpha = false;
  let hasIccProfile = false;
  while (p + 8 <= declared) {
    const type = ascii(b, p, 4);
    const size = le32(b, p + 4);
    const from = p + 8;
    const next = from + size + (size % 2);
    if (next > declared || next <= p) invalid('Truncated WebP chunk');
    if (type === 'ANIM' || type === 'ANMF') {
      throw new RasterError('UNSUPPORTED_ANIMATION', 'Animated WebP is unsupported');
    }
    if (type === 'ICCP') hasIccProfile = true;
    if (type === 'ALPH') hasAlpha = true;
    if (type === 'VP8X') {
      if (size < 10) invalid('Malformed WebP VP8X');
      const flags = b[from]!;
      if (flags & 0x02) throw new RasterError('UNSUPPORTED_ANIMATION', 'Animated WebP is unsupported');
      hasAlpha ||= (flags & 0x10) !== 0;
      hasIccProfile ||= (flags & 0x20) !== 0;
      width = 1 + b[from + 4]! + (b[from + 5]! << 8) + (b[from + 6]! << 16);
      height = 1 + b[from + 7]! + (b[from + 8]! << 8) + (b[from + 9]! << 16);
    }
    if (type === 'VP8 ' && width === 0) {
      if (size < 10 || b[from + 3] !== 0x9d || b[from + 4] !== 1 || b[from + 5] !== 0x2a) {
        invalid('Malformed WebP VP8 frame');
      }
      width = ((b[from + 7]! << 8) | b[from + 6]!) & 0x3fff;
      height = ((b[from + 9]! << 8) | b[from + 8]!) & 0x3fff;
    }
    if (type === 'VP8L') {
      if (size < 5 || b[from] !== 0x2f) invalid('Malformed WebP VP8L frame');
      if (!width) {
        width = 1 + b[from + 1]! + ((b[from + 2]! & 0x3f) << 8);
        height = 1 + (b[from + 2]! >> 6) + (b[from + 3]! << 2) + ((b[from + 4]! & 15) << 10);
      }
      hasAlpha ||= (b[from + 4]! & 0x10) !== 0;
    }
    p = next;
  }
  if (width < 1 || height < 1) invalid('WebP dimensions missing');
  return { format: 'webp', width, height, orientation: 1, hasAlpha, hasIccProfile };
}

/**
 * Encoded header checks happen *before* browser image decode, limiting
 * decompression bombs. AVIF requires a safe ISO-BMFF parser and is deferred.
 */
export function inspectBrowserHeader(data: Uint8Array): RasterHeader {
  if (data.length >= 8 && ascii(data, 0, 8) === '\u0089PNG\r\n\u001a\n') return png(data);
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return jpeg(data);
  if (data.length >= 12 && ascii(data, 0, 4) === 'RIFF' && ascii(data, 8, 4) === 'WEBP') return webp(data);
  throw new RasterError('UNSUPPORTED_FORMAT',
    'Browser adapter supports still PNG/JPEG/WebP; AVIF requires the Node engine');
}
