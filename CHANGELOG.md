# Changelog

## 0.2.0-alpha.1

- Add explicit Lanczos3, MKS2021, Mitchell and nearest-neighbor resize kernels.
- Reject unknown kernels and malformed resize values instead of allowing silent fallback.
- Add image-fidelity regression tests for transparent edge halos, ICC profile preservation and explicit sRGB conversion, orientation, alpha flattening and discrete pixel-art resampling.
- Test all four supported output formats, immutability and orientation normalization.
- Keep the no-enlargement, no-crop and original-byte preservation rules.

Perceptual quality scoring and adaptive compression are **not yet included**.

## 0.1.0-alpha.1

- Initial standalone raster processing library and reusable backend interface.
- Safe JPEG, PNG, WebP and AVIF still image inspection.
- Non-destructive resizing, format encoding, ICC preservation and output validation.
- Strict input, pixel and output byte limits.
- Automated Node.js tests and CI.

This is an **alpha**, not a stability or perceptual-quality guarantee.
