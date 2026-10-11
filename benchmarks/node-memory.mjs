/**
 * Real Node/Sharp RSS observations on synthetic multi-megapixel fixtures.
 *
 * This script measures actual operating-system process RSS, NOT a decoded-pixel
 * estimate. The OS maxRSS is a process-lifetime high-water mark and cannot be
 * attributed to one workload; 10ms periodic RSS sampling can miss short peaks.
 * No memory or latency regression gate is applied on shared CI runners.
 */
import assert from 'node:assert/strict';
import process from 'node:process';
import os from 'node:os';
import sharp from 'sharp';
import { createRasterCore } from '../dist/src/index.js';

function patternedBytes(width, height, alpha) {
  const channels = alpha ? 4 : 3;
  const data = Buffer.allocUnsafe(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * channels;
      const strip = x % 113 < 2 || y % 101 < 2;
      const detail = ((x * 31) ^ (y * 17) ^ ((x * y) >>> 3)) & 31;
      data[at] = strip ? 240 : (x * 3 + detail) & 255;
      data[at + 1] = strip ? 14 : (y * 5 + detail) & 255;
      data[at + 2] = strip ? 70 : (x + y + detail * 3) & 255;
      if (alpha) data[at + 3] = (x * 5 + y * 3) & 255;
    }
  }
  return data;
}

async function fixture(spec) {
  const buffer = patternedBytes(spec.width, spec.height, spec.alpha);
  const pipeline = sharp(buffer, {
    raw: { width: spec.width, height: spec.height,
      channels: spec.alpha ? 4 : 3 },
  });
  const encoded = spec.format === 'jpeg'
    ? await pipeline.jpeg({ quality: 88 }).toBuffer()
    : await pipeline.png({ compressionLevel: 6 }).toBuffer();
  return encoded;
}

function highWaterBytes() {
  // Linux and macOS Node resourceUsage().maxRSS is documented in KiB.
  return process.resourceUsage().maxRSS * 1024;
}

async function measured(run) {
  const before = process.memoryUsage();
  const highWaterBefore = highWaterBytes();
  let sampledRssPeak = before.rss;
  const monitor = setInterval(() => {
    sampledRssPeak = Math.max(sampledRssPeak, process.memoryUsage().rss);
  }, 10);
  monitor.unref();
  const started = process.hrtime.bigint();
  let value;
  try {
    value = await run();
  } finally {
    clearInterval(monitor);
  }
  const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
  const after = process.memoryUsage();
  sampledRssPeak = Math.max(sampledRssPeak, after.rss);
  return {
    result: value,
    measurement: {
      durationMs: Number(durationMs.toFixed(3)),
      rssBeforeBytes: before.rss,
      rssAfterBytes: after.rss,
      sampledRssPeakBytes: sampledRssPeak,
      osProcessHighWaterBeforeBytes: highWaterBefore,
      osProcessHighWaterAfterBytes: highWaterBytes(),
      sampleIntervalMs: 10,
    },
  };
}

const definitions = [
  { name: '4MP-jpeg-to-webp', width: 2400, height: 1600, alpha: false,
    format: 'jpeg', targetWidth: 1200, outputFormat: 'webp' },
  { name: '7.7MP-alpha-png-to-png', width: 3200, height: 2400, alpha: true,
    format: 'png', targetWidth: 1200, outputFormat: 'png' },
  { name: '12MP-jpeg-to-webp', width: 4000, height: 3000, alpha: false,
    format: 'jpeg', targetWidth: 1200, outputFormat: 'webp' },
];
const iterations = 3;
const core = createRasterCore();
const workloads = [];
for (const spec of definitions) {
  const input = await fixture(spec);
  const metadata = await core.inspect(input);
  assert.equal(metadata.width, spec.width);
  assert.equal(metadata.height, spec.height);
  const snapshot = Buffer.from(input);
  const execute = () => core.process(input, {
    resize: { width: spec.targetWidth, kernel: 'lanczos3' },
    format: spec.outputFormat,
    colorProfile: 'srgb',
    ...(spec.outputFormat === 'webp' ? { quality: 86 } : {}),
  });
  await execute(); // Warm up native codecs separately from measured runs.
  const measurements = [];
  let outputBytes = null;
  for (let index = 0; index < iterations; index++) {
    const { result, measurement } = await measured(execute);
    assert.equal(result.passthrough, false);
    assert.equal(result.output.width, spec.targetWidth);
    assert.equal(result.output.height,
      Math.round(spec.height * spec.targetWidth / spec.width));
    assert.equal(result.output.format, spec.outputFormat);
    assert.deepEqual(input, snapshot, 'The core must not mutate caller input');
    assert.ok(measurement.sampledRssPeakBytes >=
      Math.max(measurement.rssBeforeBytes, measurement.rssAfterBytes));
    assert.ok(measurement.osProcessHighWaterAfterBytes >=
      measurement.osProcessHighWaterBeforeBytes);
    outputBytes = result.data.byteLength;
    measurements.push(measurement);
  }
  const durations = measurements.map(x => x.durationMs).sort((a, b) => a - b);
  workloads.push({
    name: spec.name, format: spec.format, width: spec.width, height: spec.height,
    hasAlpha: spec.alpha, inputBytes: input.byteLength,
    outputFormat: spec.outputFormat, outputWidth: spec.targetWidth,
    outputHeight: Math.round(spec.height * spec.targetWidth / spec.width),
    outputBytes, iterations,
    medianDurationMs: durations[1],
    samples: measurements,
  });
}
const report = {
  schemaVersion: 1,
  kind: 'node-process-resident-memory',
  interpretation: {
    sampledPeak: '10ms sampled process RSS, may miss brief peaks',
    highWater: 'OS process-lifetime maximum RSS including native Sharp memory, fixture generation and previous workloads',
    doesNotMeasure: 'browser decoder/GPU RSS, per-image isolated peak, physical-device peak',
  },
  runtime: {
    node: process.version, platform: process.platform, arch: process.arch,
    cpus: os.cpus().length, sharp: sharp.versions.sharp,
    vips: sharp.versions.vips,
  },
  workloads,
};
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
