export type RasterErrorCode =
  | 'INVALID_INPUT'
  | 'INPUT_TOO_LARGE'
  | 'PIXEL_LIMIT_EXCEEDED'
  | 'UNSUPPORTED_FORMAT'
  | 'UNSUPPORTED_ANIMATION'
  | 'INVALID_REQUEST'
  | 'OUTPUT_TOO_LARGE'
  | 'PROCESSING_FAILED'
  | 'OUTPUT_INVALID';

export class RasterError extends Error {
  constructor(public readonly code: RasterErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RasterError';
  }
}
