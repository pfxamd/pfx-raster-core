/** Supported still raster formats in alpha. */
export type RasterFormat = 'jpeg' | 'png' | 'webp' | 'avif';

/** Resampling policies for photographs vs. hard-edged/pixel-art images. */
export type ResizeKernel = 'lanczos3' | 'mks2021' | 'mitchell' | 'nearest';

export interface ImageInfo {
  readonly format: RasterFormat;
  /** Display-oriented dimensions (EXIF Orientation accounted for). */
  readonly width: number;
  readonly height: number;
  readonly hasAlpha: boolean;
  readonly hasIccProfile: boolean;
  readonly orientation: number;
  readonly bytes: number;
}

export interface CoreLimits {
  /** Maximum encoded input size, bytes. Default: 32 MiB. */
  readonly maxInputBytes: number;
  /** Maximum decoded pixels. Default: 64 megapixels. */
  readonly maxPixels: number;
  /** Maximum encoded result size, bytes. Default: 64 MiB. */
  readonly maxOutputBytes: number;
}

export interface ResizeRequest {
  /** Maximum output width. No implicit crop. */
  readonly width?: number;
  /** Maximum output height. No implicit crop. */
  readonly height?: number;
  /**
   * Resampling kernel. Lanczos3 is the photographic default;
   * nearest preserves hard pixel boundaries when downscaling.
   * When omitted, Node uses libvips Lanczos3 and the browser uses a separate RGBA Lanczos3 implementation.
   */
  readonly kernel?: ResizeKernel;
}

export interface ProcessRequest {
  readonly resize?: ResizeRequest;
  /** 'auto' retains the input format. */
  readonly format?: RasterFormat | 'auto';
  /** 1–100. JPEG, WebP and AVIF only. */
  readonly quality?: number;
  /** Lossless PNG, WebP, or AVIF encoding. */
  readonly lossless?: boolean;
  /** Explicitly allow flattening transparency to this opaque background for JPEG. */
  readonly jpegBackground?: string;
  /** Preserve embedded ICC profile when present, or explicitly convert to sRGB. */
  readonly colorProfile?: 'preserve' | 'srgb';
}

export interface ProcessPlan {
  readonly format: RasterFormat;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  /** Auto selects the native platform default; explicitly requested kernels remain strict. */
  readonly resizeKernel: ResizeKernel | 'auto';
  readonly quality?: number;
  readonly lossless: boolean;
  readonly jpegBackground?: string;
  readonly colorProfile: 'preserve' | 'srgb';
  readonly passthrough: boolean;
}

export interface ProcessResult {
  /** A new independent byte array; never aliases the input. */
  readonly data: Uint8Array;
  readonly original: ImageInfo;
  readonly output: ImageInfo;
  readonly passthrough: boolean;
}

/** Processing backends are interchangeable without modifying the public core API. */
export interface RasterEngine {
  inspect(data: Uint8Array, limits: CoreLimits): Promise<Omit<ImageInfo, 'bytes'>>;
  transform(data: Uint8Array, plan: ProcessPlan, limits: CoreLimits): Promise<Uint8Array>;
}
