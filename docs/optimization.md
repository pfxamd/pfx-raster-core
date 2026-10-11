# Adaptive Optimization Policy — Alpha 0.4

`core.optimize(image, options)` tests a bounded set of output encodings and returns the smallest result passing a caller-defined **heuristic, sampled, reference-relative** score.

## Search

1. Take an independent byte snapshot of the input.
2. Decode and resize to requested bounds, using the normal orientation and color policies, then make a **lossless PNG reference** at exactly the requested result dimensions.
3. Keep an unchanged source when it already fits requested resize bounds and no profile conversion is required; preserve its exact encoded bytes when selected.
4. Optionally require an encoded size budget (`maxOutputBytes`, in bytes or `'input'` for the original encoded size). Disqualify over-budget candidates before the expensive quality comparison.
5. Encode each permitted format/quality combination. JPEG is automatically skipped for transparent inputs. Candidates that cannot beat the current valid result are rejected without scoring.
6. Convert the reference and eligible candidates to sRGB for comparison (without changing encoded ICC metadata). Compare equal-dimension RGBA samples. Compute 8x8 block SSIM separately for each RGB channel composited on black and white, plus the raw alpha channel. Report two scores: the **minimum mean channel score** across all blocks, and a **local detail score** (5th-percentile of weakest-channel SSIM on contrast-bearing 8x8 reference blocks). The final score is their minimum: both must meet `minScore`.
7. Accept a candidate only when its score is at least `minScore` **and** it is smaller than the best passing result. Without a strict size budget, fall back to the lossless reference or unchanged original. **With a budget, if no valid result meets both constraints, throw `RasterError('OUTPUT_TOO_LARGE')`; never silently weaken quality.**

## Metric revision: v2 local detail

The v2 quality gate uses 8x8 reference blocks with at least 32 pixels and reference RGB/alpha channel variance >= 100. Where at least 20 such blocks exist, the 5th-percentile of their lowest-channel similarity is a second mandatory quality threshold. Otherwise the detail check falls back to the global score. All scores are clipped to the 0..1 range. The original `compareRgbaBlockSsim()` helper retains its global-only v1 output; `evaluateRgbaQuality()` exposes the score breakdown. `OptimizeResult.metric` now reports `sampled-rgb-alpha-block-ssim-v2-local-detail`.

**Compatibility:** quality scores are stricter and not directly comparable to alpha.2. Existing `minScore` settings may reject previously accepted encodings. The new threshold does not certify legibility of tiny characters; resampling and block percentiles can still miss small changes, especially after downsampling to `maxEvaluationPixels`. Real-photo validation performed during development was not added as a repository fixture and is not a substitute for licensed reproducible samples.

## Defaults

- Formats: `webp, avif, jpeg` (JPEG skipped for alpha).
- Lossy qualities: `72, 84, 94, 100` (additional high-quality candidate).
- Minimum score: `0.985` (heuristic—not a universal threshold).
- Max evaluated pixels: `262144`; configurable between 64 and 1048576.
- Up to 16 codec/quality combinations. Processing is sequential to limit simultaneous memory use.
- Lossless PNG reference included automatically. Original unmodified encoded data is considered when transformation is unnecessary.

## Limits

- The lossless PNG reference is built before candidate comparison and remains subject to the core output safety limit (`limits.maxOutputBytes`), even when strict optimization budgets are smaller.
- Without an explicit optimization size budget, a high-quality resized result can be larger than the original compressed file. With `maxOutputBytes: 'input'`, the result must fit the source's encoded byte count or optimization fails explicitly.
- Size-dominated candidates may have no reported score (`reason: 'not-smaller'` or `'over-budget'`), because they are safely eliminated before perceptual scoring.
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
  qualities: [72, 84, 94, 100],
  minScore: 0.985,
  maxOutputBytes: 'input' // Optional: never return more encoded bytes than input
});
```

For reproducibility, keep the encoder/library version fixed and preserve the candidate report.
