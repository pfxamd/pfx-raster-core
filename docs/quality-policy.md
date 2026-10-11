# Image Fidelity Policy — Alpha 0.2

This project's core objective is to transform **copies** of a source image without altering the source bytes or silently introducing unexpected rendering changes.

## Preservation and expectations

- A true no-op returns independent bytes that are byte-identical to the input.
- Transformations normalize EXIF orientation before resizing.
- Resizing uses `fit: inside` and `withoutEnlargement`: no implicit crop or enlargement.
- Embedded ICC profile bytes are retained by default on output where supported by the encoder. Select `colorProfile: 'srgb'` to request explicit conversion instead. Presence and preservation are exercised using a synthetic Display P3 sample.
- Transparent images are processed with alpha-aware resampling through Sharp/libvips. Synthetic red/transparent edge tests catch common dark-fringe regression.
- Transparent input requires an explicit background for JPEG.
- Output format, bounds, and basic safety limits are verified; **no numerical perceptual-quality threshold is enforced** yet.

## Choosing a resampling kernel

| Kernel | Use |
| --- | --- |
| `lanczos3` | Default: general photographic downscaling, smooth detail |
| `mks2021` | Alternative high-quality general-purpose downscaling |
| `mitchell` | Softer filtering, useful for edges and graphics |
| `nearest` | Preserve discrete values in pixel art, masks and categorical palettes |

Only use a kernel that matches the visual content. No automatic image-type classification is claimed.

## Testing

The `tests/fidelity.test.ts` suite uses deterministic synthetic images to check edge halos, alpha flattening, color profile preservation/conversion, EXIF orientation, pixel-art palette, format roundtrips and original immutability. Synthetic tests are regression checks, **not** a subjective quality benchmark.

Future work should add licensed photographic samples, annotated fine-text images, color charts, gradients, edge maps and independent quality metrics. Metrics such as SSIM should compare output against an appropriately resized lossless reference, not against different dimensions.

## Limits

The alpha currently handles still raster images only. Animation, HDR pipeline guarantees, high bit-depth preservation, print-color fidelity, learned super-resolution, no-reference perceptual scoring and guarantees of identical pixels after lossy compression are out of scope.

## Alpha 0.4 verification coverage

The automated suite adds synthetic gradient/hard-edge scenes, line detail,
transparency visibility checks, decoding of truncated inputs, malformed
requests, and concurrent processing safety. Synthetic checks are necessary
regressions but do not establish photographic, tiny-text or print fidelity.

For reproducible size/timing comparisons and how to interpret the numbers,
see [benchmarks.md](benchmarks.md). Third-party adapters and licensed real-world
image sets remain work for a later alpha.
