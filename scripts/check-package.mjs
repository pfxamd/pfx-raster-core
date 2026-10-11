/**
 * Validate the shipped archive, not repository-relative TypeScript paths.
 * Requires "npm run check" (build + unit/browser checks) beforehand.
 * Inputs are synthetic and no file is uploaded.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = mkdtempSync(join(tmpdir(), 'pfx-raster-package-'));
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const entries = [
  ['.', 'dist/src/index'],
  ['./browser', 'dist/src/browser'],
  ['./browser/header', 'dist/src/browser/header-only'],
];

const run = (bin, args, cwd = root) =>
  execFileSync(bin, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

try {
  assert.equal(manifest.name, '@pfxamd/raster-core');
  assert.match(manifest.version, /^[0-9]+[.][0-9]+[.][0-9]+-alpha[.][0-9]+$/);
  for (const [key, stem] of entries) {
    assert.deepEqual(manifest.exports[key], {
      types: './' + stem + '.d.ts',
      import: './' + stem + '.js',
    }, 'Unexpected package API subpath: ' + key);
  }

  const metadata = JSON.parse(run('npm', [
    'pack', '--json', '--ignore-scripts', '--pack-destination', scratch,
  ]));
  assert.equal(metadata.length, 1);
  const archive = join(scratch, metadata[0].filename);
  const files = new Set(metadata[0].files.map(item => item.path));
  for (const [, stem] of entries) {
    for (const suffix of ['.js', '.d.ts']) {
      assert.ok(files.has(stem + suffix), 'Missing shipped entrypoint: ' + stem + suffix);
    }
  }
  assert.ok(files.has('LICENSE') && files.has('README.md'));
  assert.ok(!Array.from(files).some(file => file.startsWith('src/') ||
    file.startsWith('tests/') || file.startsWith('benchmarks/')),
    'Source, tests or benchmarks leaked into release archive');

  // Install the exact packed archive, including the real Sharp dependency.
  run('npm', ['install', '--no-audit', '--no-fund', '--no-package-lock',
    '--prefix', scratch, archive], scratch);

  const runtime = [
    "import assert from 'node:assert/strict';",
    "import { createRasterCore as createNode, RasterError } from '@pfxamd/raster-core';",
    "import { createRasterCore as createBrowser } from '@pfxamd/raster-core/browser';",
    "import { inspectRasterHeader } from '@pfxamd/raster-core/browser/header';",
    "assert.equal(typeof createNode, 'function');",
    "assert.equal(typeof createBrowser, 'function');",
    "assert.equal(new RasterError('INVALID_INPUT', 'test').code, 'INVALID_INPUT');",
    "const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJRgAAAAASUVORK5CYII=', 'base64');",
    "const info = inspectRasterHeader(png);",
    "assert.equal(info.format, 'png');",
    "assert.equal(info.width, 1);",
    "assert.equal(info.height, 1);",
    "assert.equal(info.bytes, png.byteLength);",
    "console.log('PACKAGED_RUNTIME_OK');",
  ].join('\n');
  writeFileSync(join(scratch, 'consumer.mjs'), runtime);
  assert.match(run(process.execPath, [join(scratch, 'consumer.mjs')], scratch),
    /PACKAGED_RUNTIME_OK/);

  const ts = [
    "import { createRasterCore as createNode, type ImageInfo, type ProcessRequest, RasterError } from '@pfxamd/raster-core';",
    "import { createRasterCore as createBrowser, type BrowserRasterCoreOptions } from '@pfxamd/raster-core/browser';",
    "import { inspectRasterHeader } from '@pfxamd/raster-core/browser/header';",
    "const req: ProcessRequest = { resize: { width: 1200, kernel: 'lanczos3' }, format: 'webp' };",
    "const options: BrowserRasterCoreOptions = { limits: { maxInputBytes: 1024 } };",
    "const node = createNode();",
    "const browser = createBrowser(options);",
    "const info: ImageInfo = inspectRasterHeader(new Uint8Array([1, 2, 3]));",
    "const err: string = new RasterError('INVALID_INPUT', 'x').code;",
    "void [node, browser, info, req, err];",
  ].join('\n');
  writeFileSync(join(scratch, 'consumer.ts'), ts);
  writeFileSync(join(scratch, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext',
      strict: true, noEmit: true, skipLibCheck: true,
    },
    files: ['consumer.ts'],
  }));
  const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  run(process.execPath, [tsc, '--project', join(scratch, 'tsconfig.json')], scratch);
  console.log('PACKAGED_API_AND_TYPES_OK', manifest.name + '@' + manifest.version);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
