# Benchmark protocol — alpha 0.4

Run the deterministic synthetic microbenchmark on Node.js 20+:

    npm install
    npm run benchmark
    npm run benchmark -- --iterations=5 --json
    npm run benchmark:smoke

The benchmark tests four operations: photographic-like JPEG to resized WebP,
hard-edge artwork PNG resizing, transparency-preserving WebP, and adaptive
encoding with four lossy candidates. The scenes are procedurally generated with
a fixed seed; no third-party photography or embedded personal data is required.

## Measurements

- Input and output bytes (including the output format and dimensions).
- Average, median, minimum and maximum wall-clock milliseconds across runs.
- Node, Sharp/libvips, OS platform and CPU architecture.
- RSS before and after each workload. **This is not peak memory** and is not
  an allocation profile. Sharp/libvips may retain caches or memory between runs.

Each workload has a warm-up run, excluded from measured samples. Measurements
are sequential. The --iterations=N option supports 1 through 20 runs.
--json emits a machine-readable report with schemaVersion: 1.
--smoke executes a single lightweight workload to confirm the benchmark runs.

## Interpretation

Results are machine-, load-, library- and codec-dependent. Never treat timing
differences on two machines or shared CI runners as proof of optimization.
Compare repeated runs on the *same* machine and runtime. For a new implementation,
keep inputs and selected encoder options identical, then compare sizes, timings,
transparency and independently evaluated visual quality.

Synthetic workloads are reproducible regression inputs, **not representative
photographic benchmarks**. Before claiming production-level fidelity, introduce
licensed/consented real-world samples covering photos, small text, saturated
color, low contrast gradients, transparency and color profiles, with controlled
human inspection. A sampled SSIM score alone cannot certify those qualities.

## Browser worker resampler benchmark (0.5.0-alpha.4)

Run `npm run benchmark:browser` with a supported Chromium installation.
Three seeded/deterministic synthetic RGBA inputs (1536x1153, 2400x1600,
4000x3000) are resized inside a dedicated browser module worker. The script
prints operation time, source/output pixel bytes, known Float32 intermediate
allocation, and the removed second Float32 buffer size. It also checks that
the window requestAnimationFrame callback continues while the worker operates.
These **are not peak process memory measurements**; browser Canvas/native image
buffers and runtime caches are outside the reported sizes.

Compare repeated real photographs and devices before drawing performance
conclusions. Emulated phone viewports are **not physical phone measurements**.

## Real Node/Sharp resident-memory observations (0.6.0-alpha.2)

Run `npm run benchmark:memory` (or `node benchmarks/node-memory.mjs`). The
script creates deterministic synthetic JPEG and transparent PNG input images,
then runs warm and repeated **actual Sharp/libvips conversions** across
multi-megapixel sizes. It does not upload source pixels.

Each operation records wall-clock time, live `process.memoryUsage().rss`
readings sampled every 10 ms, and the OS-provided `process.resourceUsage().maxRSS`
**process-lifetime high-water mark** (on Linux reported in KiB and converted to
bytes). These are real readings of the Node/Sharp operating-system process,
not predicted RGBA buffer allocations. The sample maximum can miss a short
spike; the process-lifetime high-water includes fixture generation, native
codec caches and previous work, so **it is not a workload-specific peak**.
Node RSS is not the browser worker's RSS, and neither is physical-device
total-memory use. There are no timing or memory pass/fail thresholds.

CI runs this profiling on Linux/Node 22 and stores a JSON report as a
GitHub Actions artifact. Its runner hardware and load are uncontrolled, so
compare only multiple runs on the same environment and workload. Output
format is schemaVersion 1, with runtime environment, immutable workload
sizes and byte counts, latency samples, RSS samples and maxRSS high-water.

## Browser event-loop responsiveness observations (0.6.0-alpha.2)

The existing Chromium worker benchmark now records actual
`requestAnimationFrame` sample gaps while each Worker processes synthetic
RGBA images. It reports maximum gap and count of gaps above 50 ms. These
are UI responsiveness indicators, not CPU utilization or proof of smooth
operation on every phone. Browser measurements continue to report known
typed-array sizes **only as allocated-buffer estimates**, never as measured
full browser RSS, decoder/native memory or GPU memory.

There is no supported portable browser API in this CI setup for exact worker,
decoder and GPU resident-memory peaks. Those fields are **unavailable**, not 0.

## Isolated process-retention series (0.6.0-alpha.3)

Run `npm run benchmark:retention`. The instrumented parent starts six
**independent** Node processes, each using `--expose-gc`, one warm-up
conversion, then 24 real JPEG-to-WebP resize operations in four batches of six.
Two fresh runs per scenario provide limited replication; scenario order is
reversed between rounds. There are three controlled scenarios:

- `discard-default`: do not retain result buffers; Sharp cache defaults.
- `discard-cache-disabled`: do not retain buffers; disable Sharp cache in
  that process (not in the production core).
- `retain-default`: deliberately retain each encoded output buffer as an
  interpretation control. This retains small compressed outputs, not RGBA.

After each batch the child requests V8 GC, briefly yields 40ms, and samples
process RSS, heap, external/arrayBuffer memory, OS process-lifetime RSS
high-water and Sharp cache counters. The first sample is taken **after**
fixture creation and warm-up. The same deterministic encoded input, resize,
format and output digest are verified in all six processes. CI retains full
JSON for comparison, and gates only functional/report invariants, **never an
absolute RSS value**.

### Reading the series

Observe **post-warm-up RSS across batches**, not process-lifetime high-water
as a per-image figure. Compare discarded vs deliberately retained outputs
and cache-enabled vs disabled processes. Memory managers may keep freed pages
resident indefinitely, Sharp/native allocations are not guaranteed to be
reclaimed immediately, and requested V8 GC does not collect native caches.
RSS growth over only 24 operations is not evidence of a leak; flat RSS is not
proof of absence of a leak. For investigation, repeat for many longer sessions
under controlled workloads, use native heap tools, and compare independent
process replicates on a fixed host. These Linux/Node measurements do **not**
measure an actual browser/mobile device, GPU allocations or decoded Canvas
surfaces. No input image content is uploaded.
