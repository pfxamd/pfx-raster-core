import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createRasterCore, RasterError } from '../src/index.js';

const core = createRasterCore();

test('Lanczos resizing composites transparent boundaries without dark halos', async () => {
  // Left pixel: opaque red. Right pixel: fully transparent black.
  // Incorrect straight-alpha interpolation would darken the red edge.
  const raw = Buffer.from([255, 0, 0, 255, 0, 0, 0, 0]);
  const input = await sharp(raw, { raw: { width: 2, height: 1, channels: 4 } }).png().toBuffer();
  const result = await core.process(input, { resize: { width: 1 }, format: 'png' });
  const pixels = await sharp(Buffer.from(result.data)).ensureAlpha().raw().toBuffer();
  assert.equal(result.output.width, 1);
  assert.ok(pixels[0]! >= 240, 'red channel must remain saturated around transparent edge');
  assert.ok(pixels[1]! <= 8 && pixels[2]! <= 8, 'no black or color bleeding');
  assert.ok(pixels[3]! >= 100 && pixels[3]! <= 160, 'half-coverage alpha should be preserved');
});

test('nearest resize kernel preserves discrete pixel-art palette', async () => {
  const raw = Buffer.alloc(6 * 6 * 3);
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      const value = (x + y) % 2 === 0 ? 0 : 255;
      raw.fill(value, (y * 6 + x) * 3, (y * 6 + x) * 3 + 3);
    }
  }
  const original = await sharp(raw, { raw: { width: 6, height: 6, channels: 3 } }).png().toBuffer();
  const nearest = await core.process(original, { resize: { width: 3, height: 3, kernel: 'nearest' } });
  const lanczos = await core.process(original, { resize: { width: 3, height: 3, kernel: 'lanczos3' } });
  const hard = await sharp(Buffer.from(nearest.data)).removeAlpha().raw().toBuffer();
  const smooth = await sharp(Buffer.from(lanczos.data)).removeAlpha().raw().toBuffer();
  assert.ok([...hard].every(value => value === 0 || value === 255));
  assert.ok([...smooth].some(value => value > 0 && value < 255));
});

test('all four resize kernels are accepted', async () => {
  const input = await sharp({ create: { width: 90, height: 60, channels: 3, background: '#b93472' } }).png().toBuffer();
  for (const kernel of ['nearest', 'lanczos3', 'mitchell', 'mks2021'] as const) {
    const result = await core.process(input, { resize: { width: 45, kernel } });
    assert.equal(result.output.width, 45);
    assert.equal(result.output.height, 30);
  }
});

test('invalid resize kernel cannot silently fall back', async () => {
  const input = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#123456' } }).png().toBuffer();
  await assert.rejects(
    () => core.process(input, { resize: { width: 5, kernel: 'random' as 'nearest' } }),
    (error: unknown) => error instanceof RasterError && error.code === 'INVALID_REQUEST'
  );
});

test('original ICC profile is preserved after resizing', async () => {
  const source = await sharp({ create: { width: 32, height: 16, channels: 3, background: '#d64820' } })
    .png().withIccProfile('p3').toBuffer();
  const before = await sharp(source).metadata();
  assert.ok(before.icc && before.icc.length > 0);
  const result = await core.process(source, { resize: { width: 16 }, colorProfile: 'preserve' });
  const after = await sharp(Buffer.from(result.data)).metadata();
  assert.equal(result.output.hasIccProfile, true);
  assert.ok(after.icc?.equals(before.icc!), 'preserved ICC profile bytes must match source');
});

test('explicit sRGB conversion replaces a non-sRGB profile', async () => {
  const source = await sharp({ create: { width: 32, height: 16, channels: 3, background: '#d64820' } })
    .png().withIccProfile('p3').toBuffer();
  const before = await sharp(source).metadata();
  const result = await core.process(source, { resize: { width: 16 }, colorProfile: 'srgb' });
  const after = await sharp(Buffer.from(result.data)).metadata();
  assert.equal(result.output.hasIccProfile, true);
  assert.ok(before.icc && after.icc);
  assert.ok(!before.icc.equals(after.icc), 'conversion must not mislabel an unconverted P3 profile');
});

test('orientation-aware inspection and resizing remove stale EXIF orientation', async () => {
  const source = await sharp({ create: { width: 40, height: 20, channels: 3, background: '#d64820' } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const info = await core.inspect(source);
  assert.equal(info.orientation, 6);
  assert.equal(info.width, 20);
  assert.equal(info.height, 40);
  const result = await core.process(source, { resize: { width: 16 } });
  assert.equal(result.output.width, 16);
  assert.equal(result.output.height, 32);
  const outputMeta = await sharp(Buffer.from(result.data)).metadata();
  assert.ok(outputMeta.orientation === undefined || outputMeta.orientation === 1, 'EXIF must no longer request rotation');
});

test('transparency flattening is explicit and respects background', async () => {
  const source = await sharp(Buffer.from([255, 0, 0, 128]), {
    raw: { width: 1, height: 1, channels: 4 }
  }).png().toBuffer();
  const result = await core.process(source, { format: 'jpeg', jpegBackground: '#ffffff', quality: 100 });
  const [red, green, blue] = await sharp(Buffer.from(result.data)).raw().toBuffer();
  assert.ok(red! > 240);
  assert.ok(green! > 105 && green! < 155);
  assert.ok(blue! > 105 && blue! < 155);
  assert.equal(result.output.hasAlpha, false);
});

test('transformed data never changes original caller bytes', async () => {
  const source = await sharp({ create: { width: 60, height: 30, channels: 3, background: '#fedcba' } }).png().toBuffer();
  const before = Buffer.from(source);
  await core.process(source, { resize: { width: 24 }, format: 'webp' });
  assert.deepEqual(source, before);
});

test('format and dimensions are verified across four output formats', async () => {
  const source = await sharp({ create: { width: 80, height: 40, channels: 3, background: '#fedcba' } }).png().toBuffer();
  for (const format of ['jpeg', 'png', 'webp', 'avif'] as const) {
    const result = await core.process(source, { resize: { width: 39 }, format });
    assert.equal(result.output.format, format);
    const inspectedAgain = await core.inspect(result.data);
    assert.equal(inspectedAgain.format, format, 'output must be accepted as new input');
    assert.equal(result.output.width, 39);
    assert.equal(result.output.height, 20);
  }
});
