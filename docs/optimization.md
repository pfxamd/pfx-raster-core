# Adaptive Optimization Policy — Alpha 0.3

`core.optimize(image, options)` tests a bounded set of output encodings and returns the smallest result passing a caller-defined **heuristic, sampled, reference-relative** score.

## Search

1. Take an independent byte snapshot of the input.
2. Decode and resize to requested bounds, using the normal orientation and color policies, then make a **lossless PNG reference** at exactly the requested result dimensions.
3. Keep an unchanged source when no resizing or profile conversion is required and it is smaller than that reference.
4. Encode each permitted format/quality combination. JPEG is automatically skipped for transparent inputs.
5. Convert both reference and candidates to sRGB for comparison (without changing encoded ICC metadata).
6. Compare equal-dimension RGBA samples. Compute 8x8 block SSIM separately for each RGB channel composited on black and white, plus the raw alpha channel. Report the **minimum mean channel score** to detect color/alpha differences that luminance-only SSIM misses.
7. Accept a candidate only when its score is at least `minScore` **and** it is smaller than the best passing result. If none qualifies, return the lossless reference or unchanged original.

## Defaults

- Formats: `webp, avif, jpeg` (JPEG skipped for alpha).
- Lossy qualities: `72, 84, 94`.
- Minimum score: `0.985` (heuristic—not a universal threshold).
- Max evaluated pixels: `262144`; configurable between 64 and 1048576.
- Up to 16 codec/quality combinations. Processing is sequential to limit simultaneous memory use.
- Lossless PNG reference included automatically. Original unmodified encoded data is considered when transformation is unnecessary.

## Limits

- The lossless reference can be large and may fail `maxOutputBytes`; a caller should not assume the optimizer always succeeds within the input's encoded byte budget.
- SSIM is computed on downsampled patches above the evaluation pixel cap. Tiny text, thin lines, rare local artifacts, HDR, P3 gamut differences not represented by sRGB, and complex perception may be missed.
- Scoring is not equal to perceptual equality or archival losslessness. Strict preserve-all-data use cases should use `process()` with lossless formats, not heuristic optimization.
- Original metadata may not survive re-encoding. The returned `candidates` list supplies scores and decisions; it is not a scientific image-quality certification.
- Transparent pixels are scored by alpha and appearance against two backgrounds, avoiding false positives from invisible RGB channels; this still cannot ensure suitability on every background.
- No AI-based enhancement, hallucinated detail, learned image classification or external services are used.

## Example

```ts
const result = await core.optimize(originalBytes, {
  resize: { width: 1200 },
  formats: ['webp', 'avif', 'jpeg'],
  qualities: [72, 84, 94],
  minScore: 0.985
});
```

For reproducibility, keep the encoder/library version fixed and preserve the candidate report.
