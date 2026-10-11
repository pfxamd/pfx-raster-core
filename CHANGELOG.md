# Changelog

## 0.5.0-alpha.6

- Accelerate browser Lanczos3 by storing precomputed source-byte strides in filter taps, eliminating repeated per-sample axis selection and address multiplication.
- Add a mathematically equivalent fully opaque first-pass optimization; semitransparent image math remains unchanged.
- Preserve the exact old RGBA output bytes in five deterministic regression snapshots: opaque, partial alpha, late alpha, vertical-first and fine-line images.
- Locally benchmark on the private real photograph and 6MP synthetic alpha/opaque images in Chromium; input photography is not committed.
- Retain intermediate allocation bounds, cancellation isolation (caller worker), API shape, sRGB/ICC behavior and existing browser stage-timing hooks.

**Benchmark caution:** speeds depend on browser and hardware; Chrome results do not imply the same improvement in Firefox on mobile.


## 0.5.0-alpha.5

- Optional in-worker callback for bitmap decode, pixel extraction and Lanczos3 filtering timings from the actual raw resize path.
- No behavior, filtering, codec or data transfer changes when instrumentation is omitted.


## 0.5.0-alpha.4

- Speed up browser Lanczos3 resampling using packed typed filter taps and remove the second Float32 RGBA output buffer.
- Retain premultiplied-alpha math, the 64 MiB intermediate allocation guard, and no-enlargement behavior.
- Add a synthetic worker benchmark across three image sizes with UI frame observations and theoretical allocation counts (not peak RSS).
- Verify fidelity separately against the previous algorithm on a real photograph; that photo is not committed.


## 0.5.0-alpha.3

- Add antialiased, alpha-premultiplied Lanczos3 RGBA downsampling in the browser engine instead of relying on unspecified canvas smoothing.
- Export `resizeToRgba()` and `resizeRgbaLanczos3()` so apps can encode downscaled pixels directly, without intermediate PNG files.
- Bound resampling working memory and validate no enlargement; retain explicit color-profile conversion consent.
- Add transparent-edge, fine-line, solid-color, buffer aliasing and real-browser tests.

**Note:** browser Lanczos3 filters 8-bit sRGB and is not identical to libvips or a linear-light resampler.


## 0.5.0-alpha.2

- Build compiled browser/Node entry points during Git dependency installation via the npm `prepare` lifecycle.
- Preserve existing source distribution and package export paths; no runtime behavior changes.


## 0.5.0-alpha.1

- Extract shared platform-neutral raster processing and optimization algorithms.
- Preserve existing Node Sharp API; add separate browser entry and Canvas/OffscreenCanvas adapter.
- Parse JPEG, PNG and WebP headers before decode to enforce pixel limits and reject animations.
- Require explicit permission for browser ICC color conversion; refuse unsupported exact kernels, AVIF, and lossless WebP.
- Verify actual browser encoder MIME to avoid silent PNG fallback.
- Add dependency-free browser bundle verification, header regressions and a Chromium end-to-end smoke test.

**Alpha compatibility:** Native browser codec quality and resampling differ from Node; browser output cannot guarantee original embedded ICC preservation.


## 0.4.0-alpha.3

- Add a local-detail quality guard alongside mean RGB/alpha sampled block SSIM.
- Use the lower of global score and the 5th-percentile of detailed blocks; both must pass `minScore` before selecting a lossy encoding.
- Keep `compareRgbaBlockSsim` for global-only score compatibility and export `evaluateRgbaQuality` for diagnostics.
- Version the changed optimization metric as `sampled-rgb-alpha-block-ssim-v2-local-detail` and add targeted synthetic regressions.
- Real-world development evaluation exposed previously missed fine-detail degradation; no user image is committed.

**Alpha scoring change:** numerical thresholds are not directly comparable with older metric values. Sampling still cannot guarantee tiny-text fidelity.


## 0.4.0-alpha.2

- Add opt-in `maxOutputBytes: 'input' | number` to optimization, enforcing encoded-size constraints without weakening `minScore`.
- Fail with `OUTPUT_TOO_LARGE` when no output satisfies both constraints, instead of silently returning a larger file.
- Preserve original bytes when resize bounds already fit (no resizing needed).
- Skip quality decoding for candidates that exceed size budget or cannot beat the smallest accepted output.
- Probe quality 100 in the default candidate set; document scoring limitations and test budget failures.


## 0.4.0-alpha.1

- Add synthetic fine-detail, gradient, chromatic and alpha regression tests.
- Add truncated-input, limits, malformed-request and concurrent-output tests.
- Add repeatable benchmark runner with wall-clock timings, input/output bytes, runtime metadata and before/after RSS observations.
- Run benchmark smoke test in CI alongside Node 20/22 tests.
- Document benchmark limitations and the need for independent real-world visual comparisons.

**Caution:** no production fidelity, memory-peak or cross-machine performance guarantee is claimed.

## 0.3.0-alpha.1

- Introduce `core.optimize(input, options)` for bounded codec/quality candidate search.
- Evaluate each candidate against a lossless same-dimension reference, not against a differently sized original.
- Score decoded sRGB RGB channels over black and white backgrounds plus alpha using sampled 8x8 block SSIM.
- Preserve original source bytes, reuse the original when unchanged and smaller, and fall back to the lossless reference if thresholds reject candidates.
- Cap candidates and evaluation pixels; report all quality and size decisions.
- Include deterministic tests for exact comparisons, threshold rejection, transparency, preference for smaller valid candidates and option validation.

**Caution:** sampled SSIM is a heuristic and not a scientific guarantee of perceptual image quality.

## 0.2.0-alpha.1

- Add explicit Lanczos3, MKS2021, Mitchell and nearest-neighbor resize kernels.
- Reject unknown kernels and malformed resize values instead of allowing silent fallback.
- Add image-fidelity regression tests for transparent edge halos, ICC profile preservation and explicit sRGB conversion, orientation, alpha flattening and discrete pixel-art resampling.
- Test all four supported output formats, immutability and orientation normalization.
- Keep the no-enlargement, no-crop and original-byte preservation rules.

## 0.1.0-alpha.1

- Initial standalone raster processing library and reusable backend interface.
- Safe JPEG, PNG, WebP and AVIF still image inspection.
- Non-destructive resizing, format encoding, ICC preservation and output validation.
- Strict input, pixel and output byte limits.
- Automated Node.js tests and CI.

This is an **alpha**, not a stability or perceptual-quality guarantee.
