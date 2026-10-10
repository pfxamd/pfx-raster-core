import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createRasterCore, RasterError } from '../src/index.js';

async function sample(channels: 3 | 4 = 3): Promise<Uint8Array> {
  return sharp({ create: { width: 320, height: 160, channels, background: channels === 4 ? '#ff00ff80' : '#ee9955' } })
    .png().toBuffer();
}

test('inspects supported raster images', async () => {
  const info = await createRasterCore().inspect(await sample(4));
  assert.equal(info.width, 320);
  assert.equal(info.height, 160);
  assert.equal(info.format, 'png');
  assert.equal(info.hasAlpha, true);
});

test('no-op processing returns byte-identical but independent copy', async () => {
  const original = await sample();
  const result = await createRasterCore().process(original);
  assert.equal(result.passthrough, true);
  assert.deepEqual(Buffer.from(result.data), original);
  result.data[0] = 0;
  assert.notEqual(result.data[0], original[0]);
});

test('downsizes within both bounds without enlargement', async () => {
  const core = createRasterCore();
  const result = await core.process(await sample(), { resize: { width: 100, height: 100 }, format: 'webp' });
  assert.equal(result.passthrough, false);
  assert.equal(result.output.format, 'webp');
  assert.equal(result.output.width, 100);
  assert.equal(result.output.height, 50);
});

test('does not enlarge already-small input', async () => {
  const original = await sample();
  const result = await createRasterCore().process(original, { resize: { width: 900 } });
  assert.equal(result.passthrough, true);
  assert.deepEqual(Buffer.from(result.data), original);
});

test('preserves transparency in WebP', async () => {
  const result = await createRasterCore().process(await sample(4), { format: 'webp', lossless: true });
  assert.equal(result.output.hasAlpha, true);
});

test('rejects implicit alpha loss', async () => {
  await assert.rejects(async () => createRasterCore().process(await sample(4), { format: 'jpeg' }),
    (error: unknown) => error instanceof RasterError && error.code === 'INVALID_REQUEST');
});

test('allows explicit alpha flattening for JPEG', async () => {
  const result = await createRasterCore().process(await sample(4), { format: 'jpeg', jpegBackground: '#ffffff' });
  assert.equal(result.output.format, 'jpeg');
  assert.equal(result.output.hasAlpha, false);
});

test('rejects unsupported signatures and malformed input', async () => {
  await assert.rejects(() => createRasterCore().inspect(new Uint8Array([1, 2, 3])),
    (error: unknown) => error instanceof RasterError && error.code === 'UNSUPPORTED_FORMAT');
});

test('enforces input, pixel and output limits', async () => {
  const data = await sample();
  await assert.rejects(() => createRasterCore({ limits: { maxInputBytes: 4 } }).inspect(data),
    (error: unknown) => error instanceof RasterError && error.code === 'INPUT_TOO_LARGE');
  await assert.rejects(() => createRasterCore({ limits: { maxPixels: 50 } }).inspect(data),
    (error: unknown) => error instanceof RasterError && ['INVALID_INPUT', 'PIXEL_LIMIT_EXCEEDED'].includes(error.code));
  await assert.rejects(() => createRasterCore({ limits: { maxOutputBytes: 4 } }).process(data),
    (error: unknown) => error instanceof RasterError && error.code === 'OUTPUT_TOO_LARGE');
});

test('validates conflicting encoding options', async () => {
  const input = await sample();
  await assert.rejects(() => createRasterCore().process(input, { format: 'jpeg', lossless: true }),
    (error: unknown) => error instanceof RasterError && error.code === 'INVALID_REQUEST');
  await assert.rejects(() => createRasterCore().process(input, { format: 'png', quality: 90 }),
    (error: unknown) => error instanceof RasterError && error.code === 'INVALID_REQUEST');
  await assert.rejects(() => createRasterCore().process(input, { resize: { width: -1 } }),
    (error: unknown) => error instanceof RasterError && error.code === 'INVALID_REQUEST');
});
