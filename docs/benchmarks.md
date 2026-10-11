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
