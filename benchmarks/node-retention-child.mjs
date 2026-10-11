/**
 * Isolated memory-retention observation child. Spawned with --expose-gc.
 * Real Sharp conversion with reproducible synthetic input. Each run uses one
 * independent operating-system process; only a JSON report is emitted.
 * GC requests do not guarantee native allocator/cache release.
 */
import assert from 'node:assert/strict';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from 'sharp';
import { createRasterCore } from '../dist/src/index.js';

const scenario = process.argv[2];
assert.ok(['discard-default', 'discard-cache-disabled', 'retain-default'].includes(scenario),
  'Unexpected retention scenario');
assert.equal(typeof global.gc, 'function', 'Run child with --expose-gc');
const cacheDisabled = scenario === 'discard-cache-disabled';
const retain = scenario === 'retain-default';
if (cacheDisabled) sharp.cache(false);
const width = 1920, height = 1280, targetWidth = 960;
const batchSize = 8, batches = 8;

async function makeFixture() {
  const raw = Buffer.allocUnsafe(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 3;
      const d = ((x * 7) ^ (y * 11) ^ (x * y >>> 4)) & 31;
      raw[p] = (x * 3 + d) & 255;
      raw[p + 1] = (y * 5 + d) & 255;
      raw[p + 2] = ((x + y) * 2 + d) & 255;
    }
  }
  return sharp(raw, {raw:{width,height,channels:3}}).jpeg({quality:88}).toBuffer();
}

const input = await makeFixture();
const core = createRasterCore();
const expected = await core.inspect(input);
assert.equal(expected.width, width);
assert.equal(expected.height, height);
const inputHash = createHash('sha256').update(input).digest('hex');
const request = { resize:{width:targetWidth, kernel:'lanczos3'},
  format:'webp', quality:84 };
const run = () => core.process(input, request);
const warm = await run();
assert.equal(warm.output.width, targetWidth);
assert.equal(warm.output.height, 640);
const outputHash = createHash('sha256').update(warm.data).digest('hex');
const outputBytes = warm.data.byteLength;
const retained = [];

function highWaterBytes() {
  // resourceUsage().maxRSS on the Linux CI runner is in KiB.
  return process.platform === 'linux' ? process.resourceUsage().maxRSS * 1024 : null;
}
async function snapshot(completed) {
  global.gc();
  // Give the event loop/native finalizers an opportunity; native allocators
  // may still retain physical pages and this delay is not a GC guarantee.
  await delay(40);
  global.gc();
  const usage = process.memoryUsage();
  const cache = sharp.cache();
  return {
    completed,
    rssBytes:usage.rss,
    heapUsedBytes:usage.heapUsed,
    externalBytes:usage.external,
    arrayBuffersBytes:usage.arrayBuffers,
    processLifetimeMaxRssBytes:highWaterBytes(),
    sharpCacheMemoryCurrentBytes:cache.memory.current,
    sharpCacheFileItems:cache.files.current,
    sharpCacheOperationItems:cache.items.current,
    retainedOutputs:retained.length,
    retainedOutputBytes:retained.length * outputBytes,
  };
}
const observations = [await snapshot(0)];
const batchDurationMs = [];
for (let batch = 0; batch < batches; batch++) {
  const started = process.hrtime.bigint();
  for (let i = 0; i < batchSize; i++) {
    const result = await run();
    assert.equal(result.passthrough, false);
    assert.equal(result.output.width, targetWidth);
    assert.equal(result.output.height, 640);
    assert.equal(result.data.byteLength, outputBytes);
    assert.equal(createHash('sha256').update(result.data).digest('hex'), outputHash,
      'Byte-identical transformations are expected for repeated identical inputs');
    if (retain) retained.push(result.data);
  }
  batchDurationMs.push(Number((Number(process.hrtime.bigint()-started)/1e6).toFixed(2)));
  observations.push(await snapshot((batch+1)*batchSize));
}
assert.equal(createHash('sha256').update(input).digest('hex'), inputHash,
  'Caller encoded input must remain unchanged');
assert.equal(observations.length, batches + 1);
const baseline = observations[0];
const last = observations.at(-1);
assert.ok(last);
assert.equal(last.completed, 64);
assert.equal(last.retainedOutputs, retain ? 64 : 0);
const report={
  scenario,
  cacheDisabled,
  purposelyRetainedResults:retain,
  processId:process.pid,
  input:{format:'jpeg',width,height,bytes:input.byteLength,sha256:inputHash},
  output:{format:'webp',width:targetWidth,height:640,bytes:outputBytes,sha256:outputHash},
  batches, batchSize, conversions:batchSize*batches,
  batchDurationMs,
  observations,
  baselineToFinalRssBytes:last.rssBytes-baseline.rssBytes,
  firstToLastBatchRssBytes:last.rssBytes-observations[1].rssBytes,
  notes:'Observed process RSS after requested V8 GC and 40ms; native allocator and Sharp caches may retain pages. Does not establish a leak, workload peak, or browser/mobile memory.',
};
process.stdout.write(JSON.stringify(report)+'\n');
