import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { RasterError } from '../src/core/errors.js';
import { inspectRasterHeader } from '../src/browser/header-only.js';

test('header-only inspection returns same still PNG/JPEG/WebP structural fields', async () => {
  const image = sharp({ create: { width: 137, height: 83, channels: 4,
    background: '#e28a7d70' } });
  for (const [kind, encoded] of [
    ['png', await image.clone().png().toBuffer()],
    ['jpeg', await image.clone().flatten({ background:'#fff' }).jpeg().toBuffer()],
    ['webp', await image.clone().webp().toBuffer()],
  ] as const) {
    const original = new Uint8Array(encoded);
    const copy = new Uint8Array(original);
    const header = inspectRasterHeader(original);
    assert.equal(header.format, kind);
    assert.equal(header.width, 137);
    assert.equal(header.height, 83);
    assert.equal(header.bytes, original.byteLength);
    assert.deepEqual(original, copy);
  }
});

test('header-only inspection handles large-dimensional but tiny encoded images without decoding', async () => {
  const png = await sharp({create:{
    width: 6000, height: 4000, channels: 3, background:'#225577'
  }}).png({ compressionLevel: 9 }).toBuffer();
  // The header API has no references to browser pixel decoding; this input
  // represents 91.6 MiB of would-be RGBA if decoded unnecessarily.
  const h = inspectRasterHeader(png, {maxInputBytes:8*1024*1024});
  assert.equal(h.width,6000);
  assert.equal(h.height,4000);
  assert.equal(h.hasAlpha,false);
});

test('header-only inspection enforces strict source-byte and pixel limits', async () => {
  const png = await sharp({create:{width:80,height:64,channels:4,
    background:'#44aa77'}}).png().toBuffer();
  assert.throws(() => inspectRasterHeader(png, {maxInputBytes: png.byteLength-1}),
    (e:unknown)=>e instanceof RasterError && e.code==='INPUT_TOO_LARGE');
  assert.throws(() => inspectRasterHeader(png, {maxPixels: 4000}),
    (e:unknown)=>e instanceof RasterError && e.code==='PIXEL_LIMIT_EXCEEDED');
  assert.throws(() => inspectRasterHeader(new Uint8Array()),
    (e:unknown)=>e instanceof RasterError && e.code==='INVALID_INPUT');
  assert.throws(() => inspectRasterHeader(new Uint8Array([1,2,3])),
    (e:unknown)=>e instanceof RasterError && e.code==='UNSUPPORTED_FORMAT');
});
