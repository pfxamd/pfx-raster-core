import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createRasterCore, RasterError } from '../src/index.js';

const core = createRasterCore();

function hasCode(code: string) {
  return (error: unknown) => error instanceof RasterError && error.code === code;
}

test('rejects a supported signature with truncated image contents', async () => {
  const truncated = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0]);
  await assert.rejects(() => core.inspect(truncated), hasCode('INVALID_INPUT'));
});

test('rejects formats outside the still raster scope', async () => {
  const gif = Uint8Array.from(Buffer.from('GIF89a', 'ascii'));
  await assert.rejects(() => core.inspect(gif), hasCode('UNSUPPORTED_FORMAT'));
});

test('pixel limits are enforced on realistic decoded dimensions', async () => {
  const input = await sharp({
    create: { width: 256, height: 256, channels: 3, background: '#123456' }
  }).png().toBuffer();
  const restricted = createRasterCore({ limits: { maxPixels: 10_000 } });
  await assert.rejects(
    () => restricted.inspect(input),
    (error: unknown) => error instanceof RasterError &&
      (error.code === 'INVALID_INPUT' || error.code === 'PIXEL_LIMIT_EXCEEDED')
  );
});

test('rejects malformed resize inputs without silent fallback', async () => {
  const input = await sharp({
    create: { width: 64, height: 32, channels: 3, background: '#123456' }
  }).png().toBuffer();
  for (const resize of [{}, { width: Number.POSITIVE_INFINITY }, { width: 4.5 }, { height: -1 }]) {
    await assert.rejects(
      () => core.process(input, { resize }),
      hasCode('INVALID_REQUEST')
    );
  }
});

test('concurrent requests preserve source and return independently owned outputs', async () => {
  const source = await sharp({
    create: { width: 120, height: 80, channels: 4, background: '#c85673a0' }
  }).png().toBuffer();
  const snapshot = Buffer.from(source);
  const results = await Promise.all([
    core.process(source),
    core.process(source, { resize: { width: 60 }, format: 'webp' }),
    core.process(source, { resize: { height: 40 }, format: 'png' }),
    core.process(source, { resize: { width: 90 }, format: 'avif' })
  ]);
  assert.deepEqual(source, snapshot);
  for (const result of results) {
    assert.ok(result.data.byteLength > 0);
    assert.ok(result.output.width <= 120);
    assert.ok(result.output.height <= 80);
    assert.ok(result.output.hasAlpha);
  }
  results[0]!.data[0] = 0;
  assert.deepEqual(source, snapshot);
});
