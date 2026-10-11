# Changelog

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
