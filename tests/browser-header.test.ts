import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { RasterError } from '../src/index.js';
import { inspectBrowserHeader } from '../src/browser/header.js';
import { BrowserEngine } from '../src/browser/browser-engine.js';

const limits = { maxInputBytes: 1_000_000, maxOutputBytes: 1_000_000, maxPixels: 200_000 };

test('browser header reader gets PNG dimensions and transparency safely', async () => {
  const png = await sharp({ create: { width: 48, height: 29, channels: 4,
    background: '#ff000088' } }).png().toBuffer();
  const info = inspectBrowserHeader(png);
  assert.equal(info.format, 'png');
  assert.equal(info.width, 48);
  assert.equal(info.height, 29);
  assert.equal(info.hasAlpha, true);
});

test('browser JPEG header reads orientation and embedded ICC', async () => {
  const jpeg = await sharp({ create: { width: 40, height: 22, channels: 3,
    background: '#aa5522' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const info = inspectBrowserHeader(jpeg);
  assert.equal(info.format, 'jpeg');
  assert.equal(info.width, 22);
  assert.equal(info.height, 40);
  assert.equal(info.orientation, 6);
  assert.equal(info.hasAlpha, false);
});

test('browser header detects WebP alpha and rejects unsupported formats', async () => {
  const webp = await sharp({ create: { width: 32, height: 24, channels: 4,
    background: '#ff00ff80' } }).webp().toBuffer();
  const info = inspectBrowserHeader(webp);
  assert.equal(info.format, 'webp');
  assert.equal(info.width, 32);
  assert.equal(info.height, 24);
  assert.equal(info.hasAlpha, true);
  assert.throws(() => inspectBrowserHeader(new Uint8Array([1, 2, 3])),
    (error: unknown) => error instanceof RasterError && error.code === 'UNSUPPORTED_FORMAT');
});

test('browser header checks oversized dimensions before attempting browser decode', async () => {
  const png = await sharp({ create: { width: 600, height: 500, channels: 3,
    background: '#228866' } }).png().toBuffer();
  await assert.rejects(() => new BrowserEngine().inspect(png, limits),
    (error: unknown) => error instanceof RasterError && error.code === 'PIXEL_LIMIT_EXCEEDED');
});

test('browser header rejects truncated PNG, JPEG and WebP without decode', async () => {
  const image = await sharp({ create: { width: 48, height: 30, channels: 3,
    background: '#122334' } });
  const inputs = [await image.clone().png().toBuffer(), await image.clone().jpeg().toBuffer(),
    await image.clone().webp().toBuffer()];
  for (const input of inputs) {
    assert.throws(() => inspectBrowserHeader(input.subarray(0, 24)),
      (error: unknown) => error instanceof RasterError &&
        (error.code === 'INVALID_INPUT' || error.code === 'UNSUPPORTED_FORMAT'));
  }
});
