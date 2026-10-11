import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { compareRgbaBlockSsim, createRasterCore } from '../src/index.js';
import { SharpQualityEvaluator } from '../src/optimizer/sharp-evaluator.js';

const core = createRasterCore();

/** Deterministic synthetic scene, not a substitute for licensed real photos. */
function scene(width: number, height: number, alpha = false): Uint8Array {
  const channels = alpha ? 4 : 3;
  const pixels = new Uint8Array(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const grid = x % 17 === 0 || y % 23 === 0;
      const detail = (x * 37 ^ y * 19 ^ x * y) & 31;
      pixels[i] = grid ? 240 : (x * 2 + detail) & 255;
      pixels[i + 1] = grid ? 10 : (y * 3 + detail) & 255;
      pixels[i + 2] = grid ? 30 : (x + y + detail * 3) & 255;
      if (alpha) pixels[i + 3] = (x + 2 * y) & 255;
    }
  }
  return pixels;
}

async function fixture(width: number, height: number, alpha = false): Promise<Buffer> {
  return sharp(Buffer.from(scene(width, height, alpha)), {
    raw: { width, height, channels: alpha ? 4 : 3 }
  }).png().toBuffer();
}

test('the reference and its independent lossless copy score exactly 1', async () => {
  const original = await fixture(96, 64);
  const duplicate = await sharp(original).png({ compressionLevel: 1 }).toBuffer();
  const evaluator = new SharpQualityEvaluator();
  assert.equal(await evaluator.compare(original, duplicate, 96 * 64), 1);
});

test('the metric detects a one-pixel colored line removed from detailed artwork', () => {
  const reference = new Uint8Array(64 * 64 * 4);
  const candidate = new Uint8Array(reference.length);
  for (let pixel = 0; pixel < 64 * 64; pixel++) {
    const i = pixel * 4;
    reference.set([240, 240, 240, 255], i);
    candidate.set([240, 240, 240, 255], i);
  }
  for (let y = 0; y < 64; y++) {
    const i = (y * 64 + 21) * 4;
    reference.set([220, 15, 30, 255], i);
  }
  assert.ok(compareRgbaBlockSsim(reference, candidate, 64, 64) < 1);
});

test('invisible RGB changes do not produce a false visible difference', () => {
  const reference = new Uint8Array(8 * 8 * 4);
  const candidate = new Uint8Array(reference.length);
  for (let i = 0; i < reference.length; i += 4) {
    reference.set([255, 0, 0, 0], i);
    candidate.set([0, 255, 0, 0], i);
  }
  assert.equal(compareRgbaBlockSsim(reference, candidate, 8, 8), 1);
});

test('alpha drift is detected even with matching RGB channels', () => {
  const reference = new Uint8Array(16 * 16 * 4);
  const candidate = new Uint8Array(reference.length);
  for (let i = 0; i < reference.length; i += 4) {
    reference.set([200, 30, 80, 220], i);
    candidate.set([200, 30, 80, 170], i);
  }
  assert.ok(compareRgbaBlockSsim(reference, candidate, 16, 16) < 1);
});

test('lossless reference, optimized image and source have verified bounds', async () => {
  const original = await fixture(260, 180);
  const before = Buffer.from(original);
  const result = await core.optimize(original, {
    resize: { width: 130, height: 110 },
    formats: ['webp', 'jpeg'],
    qualities: [70, 88],
    minScore: 0.95,
    maxEvaluationPixels: 130 * 90
  });
  const inspected = await core.inspect(result.data);
  assert.equal(inspected.width, 130);
  assert.equal(inspected.height, 90);
  assert.ok(result.score >= 0.95);
  assert.ok(result.data.byteLength <= result.referenceBytes);
  assert.deepEqual(original, before);
  assert.ok(result.candidates.every(c => c.score === undefined || (c.score >= 0 && c.score <= 1)));
});

test('fine-detail transparent scene survives lossless resizing with alpha', async () => {
  const original = await fixture(128, 96, true);
  const result = await core.process(original, {
    resize: { width: 64, kernel: 'lanczos3' },
    format: 'webp',
    lossless: true
  });
  assert.equal(result.output.width, 64);
  assert.equal(result.output.height, 48);
  assert.equal(result.output.hasAlpha, true);
  const raw = await sharp(Buffer.from(result.data)).ensureAlpha().raw().toBuffer();
  assert.ok(raw.some((value, i) => i % 4 === 3 && value > 0 && value < 255));
});
