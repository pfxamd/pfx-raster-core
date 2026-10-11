import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { compareRgbaBlockSsim, createRasterCore, optimizeRaster, RasterError } from '../src/index.js';

const core = createRasterCore();

function patternedRaw(width: number, height: number, alpha = false): Uint8Array {
  const channels = alpha ? 4 : 3;
  const raw = new Uint8Array(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      raw[i] = (x * 17 + y * 3 + (x * y) % 251) % 256;
      raw[i + 1] = (y * 11 + x * 5) % 256;
      raw[i + 2] = (x * 9 + y * 13) % 256;
      if (alpha) raw[i + 3] = (x * 7 + y * 9) % 256;
    }
  }
  return raw;
}

async function fixture(alpha = false): Promise<Buffer> {
  return sharp(Buffer.from(patternedRaw(128, 72, alpha)), {
    raw: { width: 128, height: 72, channels: alpha ? 4 : 3 }
  }).png().toBuffer();
}

test('identical RGBA pixels have exact metric score of 1', () => {
  const bytes = Uint8Array.from([255, 0, 0, 127, 22, 55, 88, 255]);
  assert.equal(compareRgbaBlockSsim(bytes, bytes, 2, 1), 1);
});

test('metric detects visible chromatic change and transparency drift', () => {
  const reference = new Uint8Array(8 * 8 * 4);
  for (let i = 0; i < reference.length; i += 4) {
    reference.set([255, 0, 0, 255], i);
  }
  const green = reference.slice();
  const faded = reference.slice();
  for (let i = 0; i < green.length; i += 4) {
    green[i] = 0; green[i + 1] = 255;
    faded[i + 3] = 128;
  }
  assert.ok(compareRgbaBlockSsim(reference, green, 8, 8) < 0.9);
  assert.ok(compareRgbaBlockSsim(reference, faded, 8, 8) < 0.99);
});

test('metric rejects malformed buffers and dimensions', () => {
  assert.throws(
    () => compareRgbaBlockSsim(Uint8Array.from([0, 0, 0, 255]), new Uint8Array(2), 1, 1),
    (err: unknown) => err instanceof RasterError && err.code === 'OUTPUT_INVALID'
  );
});

test('optimizer generates bounded candidates and preserves input bytes', async () => {
  const source = await fixture();
  const sourceCopy = Buffer.from(source);
  const result = await core.optimize(source, {
    resize: { width: 64, height: 50 },
    formats: ['webp', 'jpeg'],
    qualities: [72, 90],
    minScore: 0.90
  });
  assert.equal(result.output.width, 64);
  assert.equal(result.output.height, 36);
  assert.equal(result.original.width, 128);
  assert.equal(result.candidates.length, 5);
  assert.ok(result.score >= 0.9);
  assert.ok(result.data.byteLength <= result.referenceBytes);
  assert.equal(result.metric, 'sampled-rgb-alpha-block-ssim-v2-local-detail');
  assert.deepEqual(source, sourceCopy);
});

test('default optimization handles AVIF candidates and retains valid image', async () => {
  const source = await fixture();
  const result = await core.optimize(source, { resize: { width: 64 }, minScore: 0.75 });
  assert.equal(result.candidates.length, 13);
  assert.ok(result.candidates.some(c => c.quality === 100));
  assert.ok(result.candidates.some(c => c.format === 'avif' && c.bytes !== undefined));
  const meta = await core.inspect(result.data);
  assert.equal(meta.width, 64);
});

test('transparent inputs never create implicit JPEG candidates', async () => {
  const source = await fixture(true);
  const result = await core.optimize(source, {
    resize: { width: 64 },
    formats: ['jpeg', 'webp'],
    qualities: [80, 94],
    minScore: 0.97
  });
  assert.ok(result.output.hasAlpha);
  assert.ok(result.candidates.every(c => c.format !== 'jpeg'));
});

test('a threshold of 1 rejects lossy artifacts and retains reference', async () => {
  const source = await fixture();
  const result = await core.optimize(source, {
    resize: { width: 64 },
    formats: ['jpeg'],
    qualities: [40],
    minScore: 1
  });
  assert.equal(result.output.format, 'png');
  assert.equal(result.score, 1);
  assert.equal(result.candidates[1]?.reason, 'below-threshold');
});

test('optimizer retains unchanged, smaller source instead of re-encoding', async () => {
  const source = await sharp(Buffer.from(patternedRaw(128, 72)), {
    raw: { width: 128, height: 72, channels: 3 }
  }).jpeg({ quality: 62 }).toBuffer();
  const result = await core.optimize(source, { formats: ['jpeg'], qualities: [90], minScore: 0.9999 });
  assert.equal(result.passthrough, true);
  assert.equal(result.output.format, 'jpeg');
  assert.deepEqual(Buffer.from(result.data), source);
});

test('invalid formats, candidate budgets and scoring constraints are rejected', async () => {
  const source = await fixture();
  const invalids = [
    { formats: [] },
    { formats: ['webp', 'webp'] },
    { qualities: [0] },
    { qualities: [50, 50] },
    { qualities: [10, 20, 30, 40, 50, 60], formats: ['webp', 'jpeg', 'avif'] },
    { minScore: -0.01 },
    { minScore: Number.NaN },
    { maxEvaluationPixels: 0 },
    { maxEvaluationPixels: 2_000_000 },
    { resize: { width: 0 } },
    { maxOutputBytes: 0 },
    { maxOutputBytes: -1 },
    { maxOutputBytes: 10.5 },
    { maxOutputBytes: Number.NaN },
    { maxOutputBytes: 'source' }
  ];
  for (const request of invalids) {
    await assert.rejects(
      () => core.optimize(source, request as Parameters<typeof core.optimize>[1]),
      (err: unknown) => err instanceof RasterError && err.code === 'INVALID_REQUEST'
    );
  }
});

test('optimizer reports rejected candidates rather than concealing quality failures', async () => {
  const source = await fixture();
  const alwaysFail = { async compare() { return 0; } };
  const result = await optimizeRaster(core, source,
    { formats: ['webp'], qualities: [70], minScore: 0.95, resize: { width: 64 } }, alwaysFail);
  assert.equal(result.output.format, 'png');
  assert.equal(result.candidates[1]?.accepted, false);
  assert.equal(result.candidates[1]?.reason, 'below-threshold');
});

test('no-op resize keeps compressed source bytes when the bounds already fit', async () => {
  const source = await sharp(Buffer.from(patternedRaw(128, 72)), {
    raw: { width: 128, height: 72, channels: 3 }
  }).jpeg({ quality: 62 }).toBuffer();
  const result = await core.optimize(source, {
    resize: { width: 500, height: 300 },
    formats: ['jpeg'], qualities: [95], minScore: 1,
    maxOutputBytes: 'input'
  });
  assert.equal(result.passthrough, true);
  assert.deepEqual(Buffer.from(result.data), source);
  assert.ok(result.candidates.some(c => c.reason === 'original'));
});

test('input-sized strict budget preserves quality or fails, never grows resized output', async () => {
  const source = await sharp(Buffer.from(patternedRaw(128, 72)), {
    raw: { width: 128, height: 72, channels: 3 }
  }).jpeg({ quality: 62 }).toBuffer();
  const snapshot = Buffer.from(source);
  const reference = await core.process(source, { resize: { width: 64 }, format: 'png' });
  assert.ok(reference.data.byteLength > source.byteLength, 'fixture must exercise oversized reference');
  await assert.rejects(
    () => core.optimize(source, {
      resize: { width: 64 }, formats: ['jpeg'], qualities: [40],
      minScore: 1, maxOutputBytes: 'input'
    }),
    (error: unknown) => error instanceof RasterError && error.code === 'OUTPUT_TOO_LARGE'
  );
  assert.deepEqual(source, snapshot);
});

test('input-sized budget accepts an encoded result when the quality gate allows it', async () => {
  const source = await fixture();
  const result = await core.optimize(source, {
    resize: { width: 64 }, formats: ['webp'], qualities: [65, 85],
    minScore: 0.1, maxOutputBytes: 'input'
  });
  assert.equal(result.output.width, 64);
  assert.ok(result.data.byteLength <= source.byteLength);
  assert.ok(result.score >= 0.1);
});

test('numeric size budget is strict and avoids unnecessary quality comparisons', async () => {
  const source = await fixture();
  let calls = 0;
  await assert.rejects(
    () => optimizeRaster(core, source, {
      resize: { width: 64 }, formats: ['webp'], qualities: [70],
      minScore: 0.5, maxOutputBytes: 1
    }, { async compare() { calls++; return 1; } }),
    (error: unknown) => error instanceof RasterError && error.code === 'OUTPUT_TOO_LARGE'
  );
  assert.equal(calls, 0);
});

test('lossless fallback remains available when no strict size budget is requested', async () => {
  const source = await sharp(Buffer.from(patternedRaw(128, 72)), {
    raw: { width: 128, height: 72, channels: 3 }
  }).jpeg({ quality: 62 }).toBuffer();
  const result = await core.optimize(source, {
    resize: { width: 64 }, formats: ['jpeg'], qualities: [40], minScore: 1
  });
  assert.equal(result.output.format, 'png');
  assert.equal(result.score, 1);
  assert.ok(result.data.byteLength > source.byteLength);
});
