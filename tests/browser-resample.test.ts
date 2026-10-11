import test from 'node:test';
import assert from 'node:assert/strict';
import { RasterError } from '../src/core/errors.js';
import { resizeRgbaLanczos3 } from '../src/browser/resample.js';

function solid(width: number, height: number, rgba: readonly [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return data;
}

test('Lanczos3 downscale retains constant opaque colors and does not change input', () => {
  const input = solid(75, 53, [37, 131, 224, 255]);
  const snapshot = input.slice();
  const resized = resizeRgbaLanczos3(input, 75, 53, 24, 17);
  assert.equal(resized.data.length, 24 * 17 * 4);
  for (let i = 0; i < resized.data.length; i += 4) {
    for (let channel = 0; channel < 4; channel++) {
      assert.ok(Math.abs(resized.data[i + channel]! - snapshot[channel]!) <= 1);
    }
  }
  assert.deepEqual(input, snapshot);
});

test('transparent neighboring pixels do not bleed hidden RGB into edge', () => {
  const input = new Uint8ClampedArray(60 * 20 * 4);
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 60; x++) {
      const i = (y * 60 + x) * 4;
      input[i] = x < 30 ? 255 : 0;
      input[i + 1] = x < 30 ? 0 : 255;
      input[i + 2] = 0;
      input[i + 3] = x < 30 ? 255 : 0;
    }
  }
  const resized = resizeRgbaLanczos3(input, 60, 20, 15, 5);
  let partiallyTransparent = 0;
  for (let i = 0; i < resized.data.length; i += 4) {
    if (resized.data[i + 3]! > 0 && resized.data[i + 3]! < 255) {
      partiallyTransparent++;
      assert.ok(resized.data[i]! >= 250, 'opaque-edge red stays red');
      assert.ok(resized.data[i + 1]! <= 5, 'hidden transparent green never bleeds into edge');
    }
  }
  assert.ok(partiallyTransparent > 0);
});

test('no-op filter retains all values and does not alias the input', () => {
  const data = solid(8, 6, [35, 12, 190, 150]);
  const output = resizeRgbaLanczos3(data, 8, 6, 8, 6);
  assert.deepEqual(output.data, data);
  output.data[0] = 0;
  assert.equal(data[0], 35);
});

test('invalid dimensions and budget are rejected before allocating working buffers', () => {
  const input = solid(8, 6, [50, 70, 90, 255]);
  for (const dimensions of [[8, 6, 9, 6], [8, 6, 8.5, 4],
    [8, 6, 0, 3], [7, 6, 4, 3], [8, 6, 8, Number.NaN]]) {
    assert.throws(() => resizeRgbaLanczos3(input,
      dimensions[0]!, dimensions[1]!, dimensions[2]!, dimensions[3]!),
      (error: unknown) => error instanceof RasterError && error.code === 'INVALID_REQUEST');
  }
  assert.throws(() => resizeRgbaLanczos3(input, 8, 6, 8, 6_000_000),
    (error: unknown) => error instanceof RasterError && error.code === 'INVALID_REQUEST');
});

test('thin line downsample produces intermediate tones, not nearest-neighbor aliasing', () => {
  const data = solid(64, 64, [255, 255, 255, 255]);
  for (let y = 0; y < 64; y++) {
    const i = (y * 64 + 31) * 4;
    data.set([0, 0, 0, 255], i);
  }
  const result = resizeRgbaLanczos3(data, 64, 64, 16, 16);
  assert.ok(result.data.some((v, i) => i % 4 === 0 && v > 0 && v < 255));
});
