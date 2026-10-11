/**
 * Reproducible, synthetic microbenchmark. Timings are observations, not CI gates
 * or a perceptual-quality certification. Run multiple times on a quiet machine.
 */
import process from 'node:process';
import sharp from 'sharp';
import { createRasterCore } from '../src/index.js';

type Output = { data: Uint8Array; output: { width: number; height: number; format: string } };
type Workload = { name: string; input: Buffer; run: () => Promise<Output> };

function pixels(width: number, height: number, alpha: boolean): Buffer {
  const channels = alpha ? 4 : 3;
  const data = Buffer.allocUnsafe(width * height * channels);
  let seed = 0x4f1bbcdc;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const noise = seed & 31;
      const i = (y * width + x) * channels;
      const stripe = x % 41 < 2 || y % 37 < 2;
      data[i] = stripe ? 240 : (x * 255 / width + noise) & 255;
      data[i + 1] = stripe ? 28 : (y * 255 / height + noise) & 255;
      data[i + 2] = stripe ? 40 : (x + y + noise * 3) & 255;
      if (alpha) data[i + 3] = (x * 2 + y) & 255;
    }
  }
  return data;
}

async function fixtures() {
  const photo = await sharp(pixels(320, 240, false), {
    raw: { width: 320, height: 240, channels: 3 }
  }).jpeg({ quality: 92 }).toBuffer();
  const artwork = await sharp(pixels(320, 240, false), {
    raw: { width: 320, height: 240, channels: 3 }
  }).png().toBuffer();
  const transparent = await sharp(pixels(192, 192, true), {
    raw: { width: 192, height: 192, channels: 4 }
  }).png().toBuffer();
  return { photo, artwork, transparent };
}

function iterationsFromArgs(args: string[]): number {
  const arg = args.find(value => value.startsWith('--iterations='));
  if (!arg) return 3;
  const n = Number(arg.slice('--iterations='.length));
  if (!Number.isSafeInteger(n) || n < 1 || n > 20) {
    throw new Error('--iterations must be an integer between 1 and 20');
  }
  return n;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const iterations = iterationsFromArgs(args);
  const smoke = args.includes('--smoke');
  const core = createRasterCore();
  const { photo, artwork, transparent } = await fixtures();
  const workloads: Workload[] = [
    { name: 'photo-jpeg-to-webp', input: photo, run: () => core.process(photo, {
      resize: { width: 240 }, format: 'webp', quality: 85
    }) },
    { name: 'artwork-png-resize', input: artwork, run: () => core.process(artwork, {
      resize: { width: 240 }, format: 'png'
    }) },
    { name: 'transparency-webp-lossless', input: transparent, run: () => core.process(transparent, {
      resize: { width: 144 }, format: 'webp', lossless: true
    }) },
    { name: 'photo-adaptive-optimization', input: photo, run: () => core.optimize(photo, {
      resize: { width: 240 }, formats: ['webp', 'jpeg'], qualities: [72, 88],
      minScore: 0.96
    }) }
  ];
  const rows = [];
  for (const workload of smoke ? workloads.slice(0, 1) : workloads) {
    await workload.run(); // Warm the encoder; do not mix cold-start latency into samples.
    const ms: number[] = [];
    let result: Output | undefined;
    const rssBefore = process.memoryUsage().rss;
    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      result = await workload.run();
      ms.push(Number(process.hrtime.bigint() - start) / 1e6);
    }
    ms.sort((a, b) => a - b);
    const sum = ms.reduce((a, b) => a + b, 0);
    rows.push({
      workload: workload.name,
      iterations,
      inputBytes: workload.input.byteLength,
      outputBytes: result!.data.byteLength,
      output: result!.output,
      avgMs: Number((sum / ms.length).toFixed(3)),
      medianMs: Number((ms[Math.floor(ms.length / 2)]!).toFixed(3)),
      minMs: Number(ms[0]!.toFixed(3)),
      maxMs: Number(ms[ms.length - 1]!.toFixed(3)),
      rssBeforeBytes: rssBefore,
      rssAfterBytes: process.memoryUsage().rss
    });
  }
  const report = {
    schemaVersion: 1,
    description: 'Synthetic raster benchmark; RSS before/after is not peak memory',
    runtime: { node: process.version, platform: process.platform, arch: process.arch,
      sharp: sharp.versions.sharp, vips: sharp.versions.vips },
    results: rows
  };
  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write('Synthetic benchmark (lower ms is faster; not comparable across machines)\n');
    for (const row of rows) {
      process.stdout.write(row.workload + ': avg ' + row.avgMs + ' ms, ' +
        row.inputBytes + ' -> ' + row.outputBytes + ' bytes\n');
    }
  }
}

main().catch(error => {
  process.stderr.write(String(error) + '\n');
  process.exitCode = 1;
});
