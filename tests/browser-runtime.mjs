import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const chrome = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/usr/bin/chromium-browser', chromium.executablePath()]
  .find(path => path && existsSync(path));
if (!chrome) throw new Error('No Chrome/Chromium available for real-browser smoke test');

const bundle = readFileSync(new URL('../dist/browser-bundle.mjs', import.meta.url));
const server = createServer((req, res) => {
  if (req.url === '/browser-bundle.mjs') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    res.end(bundle);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><title>Raster Core Browser Smoke</title>');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Local smoke server failed');
  browser = await chromium.launch({
    executablePath: chrome,
    headless: true,
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto('http://127.0.0.1:' + address.port + '/');
  const outcome = await page.evaluate(async () => {
    const mod = await import('/browser-bundle.mjs');
    const core = mod.createRasterCore();
    const canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 100;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw Error('Canvas unavailable');
    context.fillStyle = '#386ab3'; context.fillRect(0, 0, 160, 100);
    context.fillStyle = '#eeeeee'; context.fillRect(20, 15, 120, 70);
    context.fillStyle = '#224422'; context.fillRect(35, 20, 1, 60);
    const make = (surface, format) => new Promise((resolve, reject) =>
      surface.toBlob(value => value ? resolve(value) : reject(Error('Codec unavailable')), format, 0.92));
    const originalBlob = await make(canvas, 'image/jpeg');
    const original = new Uint8Array(await originalBlob.arrayBuffer());
    const info = await core.inspect(original);
    const unchanged = await core.process(original);
    let preserveIccError = '';
    if (info.hasIccProfile) {
      try { await core.process(original, { format: 'webp' }); }
      catch (error) { preserveIccError = error.code; }
    }
    const webp = await core.process(original, { resize: { width: 80 }, format: 'webp', colorProfile: 'srgb' });
    const nearest = await core.process(original, {
      resize: { width: 80, kernel: 'nearest' }, format: 'png', colorProfile: 'srgb'
    });
    let losslessError = '';
    try {
      await core.process(original, { format: 'webp', lossless: true, colorProfile: 'srgb' });
    } catch (error) { losslessError = error.code; }
    const optimization = await core.optimize(original, {
      resize: { width: 80 }, formats: ['webp', 'jpeg'], qualities: [72, 90],
      maxOutputBytes: 'input', minScore: 0.4, colorProfile: 'srgb'
    });
    const explicitLanczos = await core.process(original, { resize: { width: 80, kernel: 'lanczos3' }, format: 'png', colorProfile: 'srgb' });
    const raw = await mod.resizeToRgba(original, { resize: { width: 80 }, colorProfile: 'srgb' });
    let avifError = '';
    try {
      await core.process(original, { format: 'avif' });
    } catch (error) { avifError = error.code; }
    const transparent = document.createElement('canvas');
    transparent.width = 16; transparent.height = 16;
    const alphaCtx = transparent.getContext('2d');
    if (!alphaCtx) throw Error('Alpha canvas missing');
    alphaCtx.fillStyle = 'rgba(220, 30, 80, 0.45)';
    alphaCtx.fillRect(0, 0, 8, 16);
    const alphaBytes = new Uint8Array(await (await make(transparent, 'image/png')).arrayBuffer());
    const alphaOutput = await core.process(alphaBytes, { format: 'webp', quality: 90, colorProfile: 'srgb' });
    let flattenError = '';
    try { await core.process(alphaBytes, { format: 'jpeg' }); }
    catch (error) { flattenError = error.code; }
    const caps = await mod.probeBrowserRasterCapabilities();
    return {
      input: { format: info.format, width: info.width, height: info.height,
        hasAlpha: info.hasAlpha, hasIccProfile: info.hasIccProfile },
      passthrough: unchanged.passthrough &&
        unchanged.data.length === original.length &&
        unchanged.data.every((v, i) => v === original[i]),
      resized: { format: webp.output.format, width: webp.output.width, height: webp.output.height },
      optimizer: { score: optimization.score, bytes: optimization.data.byteLength,
        inputBytes: original.byteLength, format: optimization.output.format },
      lanczosWidth: explicitLanczos.output.width, rawBytes: raw.data.length, avifError, preserveIccError, losslessError,
      nearestWidth: nearest.output.width, flattenError, alpha: alphaOutput.output.hasAlpha,
      encoders: caps.encoding
    };
  });
  assert.equal(outcome.input.format, 'jpeg');
  assert.equal(outcome.input.width, 160);
  assert.equal(outcome.input.height, 100);
  assert.equal(outcome.input.hasAlpha, false);
  if (outcome.input.hasIccProfile) assert.equal(outcome.preserveIccError, 'UNSUPPORTED_FORMAT');
  assert.equal(outcome.passthrough, true);
  assert.deepEqual(outcome.resized, { format: 'webp', width: 80, height: 50 });
  assert.ok(outcome.optimizer.bytes <= outcome.optimizer.inputBytes);
  assert.ok(outcome.optimizer.score >= 0.4);
  assert.equal(outcome.lanczosWidth, 80);
  assert.equal(outcome.rawBytes, 80 * 50 * 4);
  assert.equal(outcome.losslessError, 'UNSUPPORTED_FORMAT');
  assert.equal(outcome.nearestWidth, 80);
  assert.equal(outcome.flattenError, 'INVALID_REQUEST');
  assert.equal(outcome.avifError, 'UNSUPPORTED_FORMAT');
  assert.equal(outcome.alpha, true);
  assert.ok(outcome.encoders.includes('png') && outcome.encoders.includes('webp'));
  assert.deepEqual(errors, []);
  process.stdout.write('PASS browser smoke: ' + JSON.stringify(outcome) + '\n');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
