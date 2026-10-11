import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createRasterCore } from '../src/index.js';
import { RasterError } from '../src/core/errors.js';
import { inspectRasterHeader } from '../src/browser/header-only.js';

const withCode = (code: string) =>
  (value: unknown) => value instanceof RasterError && value.code === code;

function syntheticWebpHeader(width: number, height: number): Uint8Array {
  const data = new Uint8Array(26);
  data.set([82, 73, 70, 70], 0); // RIFF
  const view = new DataView(data.buffer);
  view.setUint32(4, data.length - 8, true);
  data.set([87, 69, 66, 80, 86, 80, 56, 76], 8); // WEBP VP8L
  view.setUint32(16, 5, true);
  data[20] = 0x2f;
  const dimensionBits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  view.setUint32(21, dimensionBits >>> 0, true);
  return data;
}

test('exact encoded byte and pixel ceilings are accepted; next-lower ceilings reject', () => {
  const encoded = syntheticWebpHeader(6000, 4000);
  const info = inspectRasterHeader(encoded, {
    maxInputBytes: encoded.byteLength, maxPixels: 24_000_000
  });
  assert.equal(info.format, 'webp');
  assert.equal(info.width, 6000);
  assert.equal(info.height, 4000);
  assert.equal(info.bytes, encoded.byteLength);
  assert.throws(() => inspectRasterHeader(encoded, {
    maxInputBytes: encoded.byteLength - 1
  }), withCode('INPUT_TOO_LARGE'));
  assert.throws(() => inspectRasterHeader(encoded, {
    maxPixels: 24_000_000 - 1
  }), withCode('PIXEL_LIMIT_EXCEEDED'));
});

test('invalid memory budgets and unsafe dimension limits fail before image read', () => {
  const source = syntheticWebpHeader(5, 4);
  for (const invalid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1]) {
    for (const key of ['maxInputBytes', 'maxPixels', 'maxOutputBytes'] as const) {
      assert.throws(() => inspectRasterHeader(source, { [key]: invalid }),
        withCode('INVALID_REQUEST'), key + ': ' + invalid);
    }
  }
});

test('incomplete RIFF frames, truncated PNG chunks and bad JPEG segments use RasterError', async () => {
  const png = await sharp({ create: { width: 13, height: 7, channels: 4,
    background: '#25aabb80' } }).png().toBuffer();
  const jpeg = await sharp({ create: { width: 11, height: 9, channels: 3,
    background: '#cc8844' } }).jpeg().toBuffer();
  const webp = await sharp({ create: { width: 15, height: 10, channels: 4,
    background: '#99553380' } }).webp().toBuffer();

  // Header-only is intentionally not a complete bitstream integrity validator.
  // PNG and WebP structure carries end/RIFF sizes, unlike JPEG entropy data.
  for (const cut of [8, 20, 32, png.length - 1]) {
    if (cut >= png.length) continue;
    assert.throws(() => inspectRasterHeader(png.subarray(0, cut)),
      withCode('INVALID_INPUT'), 'PNG prefix: ' + cut);
  }
  for (const cut of [12, 20, webp.length - 1]) {
    assert.throws(() => inspectRasterHeader(webp.subarray(0, cut)),
      withCode('INVALID_INPUT'), 'WebP prefix: ' + cut);
  }
  // A forged APP segment extending beyond the supplied bytes is not valid.
  assert.throws(() => inspectRasterHeader(Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0, 0
  ])), withCode('INVALID_INPUT'));
  assert.equal(inspectRasterHeader(jpeg).format, 'jpeg');
});

test('animated PNG and WebP are refused by the lightweight path', async () => {
  const png = await sharp({ create: { width: 4, height: 3, channels: 3,
    background: '#2299aa' } }).png().toBuffer();
  const actl = new Uint8Array(20);
  actl.set([0, 0, 0, 8, 97, 99, 84, 76], 0); // acTL length=8; CRC omitted by design
  const animatedPng = new Uint8Array(png.byteLength + actl.byteLength);
  animatedPng.set(png.subarray(0, 33));
  animatedPng.set(actl, 33);
  animatedPng.set(png.subarray(33), 33 + actl.byteLength);
  assert.throws(() => inspectRasterHeader(animatedPng), withCode('UNSUPPORTED_ANIMATION'));

  const animatedWebp = new Uint8Array(30);
  animatedWebp.set([82, 73, 70, 70], 0);
  new DataView(animatedWebp.buffer).setUint32(4, 22, true);
  animatedWebp.set([87, 69, 66, 80, 86, 80, 56, 88], 8);
  new DataView(animatedWebp.buffer).setUint32(16, 10, true);
  animatedWebp[20] = 0x02; // VP8X animation flag
  assert.throws(() => inspectRasterHeader(animatedWebp), withCode('UNSUPPORTED_ANIMATION'));
});

test('deterministic corrupted header bytes never produce unrelated runtime exceptions', async () => {
  const base = sharp({ create: { width: 45, height: 25, channels: 4,
    background: '#5588cc88' } });
  const fixtures = [
    await base.clone().png().toBuffer(),
    await base.clone().webp().toBuffer(),
    await base.clone().jpeg().toBuffer()
  ];
  let state = 0x6a09e667;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  let checked = 0;
  for (const fixture of fixtures) {
    for (let i = 0; i < 160; i++) {
      const edited = Uint8Array.from(fixture);
      const offset = random() % edited.byteLength;
      edited[offset] ^= (random() % 255) + 1;
      try {
        const parsed = inspectRasterHeader(edited);
        // Structural parsing may accept a file whose pixels cannot decode.
        assert.ok(parsed.width >= 1 && parsed.height >= 1);
      } catch (error) {
        assert.ok(error instanceof RasterError,
          'Malformed input must not leak a native exception: ' + String(error));
      }
      checked++;
    }
  }
  assert.equal(checked, 480);
});

test('the Node core snapshots caller input before an asynchronous transform', async () => {
  const data = await sharp({ create: { width: 80, height: 50, channels: 4,
    background: '#36aaff80' } }).png().toBuffer();
  const original = Uint8Array.from(data);
  const pending = createRasterCore().process(data, {
    resize: { width: 40, kernel: 'lanczos3' }, format: 'webp'
  });
  data.fill(0);
  const processed = await pending;
  assert.equal(processed.original.width, 80);
  assert.equal(processed.output.width, 40);
  assert.equal(processed.output.height, 25);
  assert.equal(processed.output.hasAlpha, true);
  const rechecked = inspectRasterHeader(original);
  assert.equal(rechecked.width, 80);
  assert.equal(rechecked.height, 50);
});
