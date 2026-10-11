import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(root, 'dist/browser-metafile.json'), 'utf8'));
const inputs = Object.keys(manifest.inputs);
assert.ok(inputs.some(path => path.includes('browser/browser-engine.ts')));
assert.ok(inputs.some(path => path.includes('optimizer/search.ts')));
assert.ok(inputs.every(path => !/(^|\/)(sharp|node_modules\/sharp)(\/|$)/i.test(path)),
  'Browser bundle must not contain Sharp');
assert.ok(inputs.every(path => !/(^|\/)(core\/core|optimizer\/optimize|sharp-evaluator|sharp-engine)\.ts$/.test(path)),
  'Browser bundle must not import Node facades');
assert.ok(inputs.every(path => !path.startsWith('node:')), 'Browser bundle has no Node built-ins');
const content = await readFile(resolve(root, 'dist/browser-bundle.mjs'), 'utf8');
assert.ok(!content.includes('require("node:'), 'Bundled browser source must not require Node');
await import(resolve(root, 'dist/src/browser.js'));
const headerManifest = JSON.parse(await readFile(resolve(root, 'dist/header-only-metafile.json'), 'utf8'));
const headerPaths = Object.keys(headerManifest.inputs);
assert.ok(headerPaths.some(path => path.endsWith('browser/header.ts')));
assert.ok(headerPaths.every(path => !/(sharp|canvas|browser-engine|resample|optimizer|node_modules)/i.test(path)),
  'Header-only browser bundle must not import Canvas, decoder, resampler, Sharp or optimizer');
const headerBundle = await readFile(resolve(root, 'dist/header-only-bundle.mjs'), 'utf8');
assert.ok(headerBundle.length < 25_000, 'Header-only helper unexpectedly large');
await import(resolve(root, 'dist/src/browser/header-only.js'));
process.stdout.write('PASS: Browser and lightweight header-only bundles contain no native codecs or Node runtime dependencies\\n');
