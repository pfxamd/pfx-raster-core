# Raster Core test coverage and measurement limits

Version: 0.6.0-alpha.2. This file records **test coverage**, not a claim of device-wide production guarantees.

## Verified automatically

- Unit and fidelity checks for orientation, ICC handling, alpha flattening, lossless output, encoded format and sizing in the Node adapter.
- Browser resampling golden SHA-256 baselines for opaque, partially transparent, late-alpha, vertical-first and thin-line fixtures.
- Structural-header checks for PNG/JPEG/WebP, malformed chunks, animated variants, input/pixel boundary limits and invalid numeric limit overrides.
- Seeded reproducible mutation of 480 synthetic encoded headers: only validated metadata or typed RasterError results are acceptable. This is robustness sampling, not fuzzing completeness or bitstream authentication.
- Real Chromium tests: encoding/decoding, output bounds, and a **metadata-only 24MP WebP** whose header is readable without decoded pixels or calling createImageBitmap.
- Snapshotting of encoded caller-owned input prior to asynchronous processing, preserving ownership.

## Not established by these tests

- Peak device RSS, GPU memory, browser decoder allocation or complete Android/Firefox memory consumption. JavaScript heap, theoretical pixel buffers and synthetic timings are **not** real memory peaks.
- Production-grade real photography fidelity across color profiles, every device/browser, and varied content.
- Full validation of image payload CRCs, JPEG entropy data, WebP payload decoding by the lightweight header-only API.
- Unbounded hostile-input resistance, native codec vulnerabilities, or long-run sustained throughput.

## Instrumented Node memory and Chromium UI measurements

The profiling scripts record Node/Sharp process RSS at 10 ms intervals and
OS process-lifetime RSS high-water during multi-megapixel synthetic conversion,
with Chromium Worker wall time and observed frame gaps. These numbers are
observations and CI artifacts, not proof of a per-image browser/device peak.
See [benchmark methodology](benchmarks.md).

## Next measurement gate

Measure actual browser worker processing on representative licensed images at realistic sizes, including per-stage timing and device-reported memory where available, without uploading private image content. Only propose engine optimization after a reproducible regression or measured bottleneck is identified. Keep existing release and consumer compatibility checks mandatory.
