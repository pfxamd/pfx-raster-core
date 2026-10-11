# PFx Raster Core

Independent, open-source raster processing core for safe, reusable image transformations.

**Status:** `0.5.0-alpha.8` — experimental. The repository prepares an npm-distributable tarball; public npm publication is not implied.

## Scope

- JPEG, PNG, WebP, and AVIF **still images**.
- Inspect orientation-aware dimensions, alpha, and embedded ICC profile presence.
- Resize within specified bounds without cropping or enlargement, with an explicit resampling kernel for photographic and pixel-art content.
- Encode to an explicit format, with optional quality or lossless mode.
- Preserve embedded ICC profiles by default in Node.js; browser conversions require explicit sRGB permission when ICC is present.
- Validate input signatures, dimension limits and generated results.
- Preserve the original bytes. If no transformation is needed, return a byte-identical copy.

This is **not** an AI upscaler, denoiser, independently validated perceptual-quality optimizer, or image storage system. Those are separate possible future layers. It does not promise perceptual equivalence after lossy encoding.

Git dependency installs now run a `prepare` step that compiles `dist/src` before packaging. This supports pinned GitHub consumption while npm publication remains separate.

The three supported package entrypoints are the Node root, browser adapter, and browser/header-only inspector. API contracts, packed-consumer verification, and the publication gate are described in [Distribution and API policy](docs/distribution.md). Do not switch downstream applications from their pinned Git revisions until an exact registry version is confirmed and tested.

## Install from source

```bash
npm install
npm run check
```

Node.js 20+ is required for the Node adapter (Sharp/libvips). A separate browser entry now uses Canvas/OffscreenCanvas and shares validation, optimization and processing policies. Browsers do not need Sharp at runtime. The browser entry also exports `resizeToRgba()` so downstream image encoders can work directly on pixels without temporary PNG files.

## Example

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { createRasterCore } from '@pfxamd/raster-core';

const core = createRasterCore();
const input = await readFile('original.png');
const metadata = await core.inspect(input);

const result = await core.process(input, {
  resize: { width: 1200, height: 1200, kernel: 'lanczos3' },
  format: 'webp',
  quality: 85
});

await writeFile('display.webp', result.data);
console.log(metadata, result.output, result.passthrough);

// Bounded adaptive search (not the same as guaranteed perceptual equivalence).
const optimized = await core.optimize(input, {
  resize: { width: 1200 },
  minScore: 0.985,
  maxOutputBytes: 'input', // Optional strict limit: throw if quality and size cannot both be met
  formats: ['webp', 'avif', 'jpeg']
});
console.log(optimized.output.format, optimized.score, optimized.candidates);
```

The package name above is a **planned package identifier**, not a claim of public npm availability. During development, import from a local checkout/workspace package.

## Faster browser Lanczos3 (0.5.0-alpha.6)

The resampler caches byte-strided tap addresses and skips redundant
per-tap alpha work for fully opaque sources. Semi-transparent images retain
the existing premultiplied-alpha math. Exact RGBA output bytes are checked
against the previous implementation for opaque, partial-alpha, late-alpha,
vertical-first, and fine-line regression fixtures.

Local Chromium benchmarks on one privately supplied photo and synthetic
6MP opaque/alpha images showed improvements, but speeds depend on browser
and hardware. The private source photograph is **not** committed.
The API, ICC conversion rules, Lanczos3 filter and memory budget are unchanged.

## Low-allocation encoded-header check (0.5.0-alpha.7)

For metadata viewers and lightweight inspection tools, the dedicated
`@pfxamd/raster-core/browser/header` entry exports `inspectRasterHeader`.
It checks JPEG/PNG/WebP structure and dimension/input limits without decoding
raster pixels or copying the caller's input byte array:

```ts
import { inspectRasterHeader } from '@pfxamd/raster-core/browser/header';
const bytes = new Uint8Array(await file.arrayBuffer());
const info = inspectRasterHeader(bytes, { maxInputBytes: 8 * 1024 * 1024 });
console.log(info.width, info.height, info.hasAlpha, info.hasIccProfile);
```

This is a **structural-header interpretation only**, not a guarantee of
complete image decodability, CRC correctness or authenticity. For pixel stream
verification use the existing asynchronous `createRasterCore().inspect()`.
This subpath has no Canvas, codec, Sharp or other heavy runtime imports.

## Browser entry (alpha 0.5)

```ts
import { createRasterCore, probeBrowserRasterCapabilities } from '@pfxamd/raster-core/browser';

const capabilities = await probeBrowserRasterCapabilities();
const core = createRasterCore();
const source = new Uint8Array(await file.arrayBuffer());
const result = await core.process(source, {
  resize: { width: 1200 },
  format: 'webp',
  colorProfile: 'srgb' // Explicitly authorize browser color conversion
});
const output = new Blob([new Uint8Array(result.data)], { type: 'image/webp' });
```

The browser adapter currently decodes/encodes **still PNG, JPEG and WebP** using browser-native codecs (WebP must be supported by the browser). **AVIF is not implemented** in this adapter. Browsers can silently substitute PNG for unsupported encoders, so every encoded MIME result is checked. An unchanged image can be returned byte-identically. PNG re-encoding is lossless at the canvas pixel representation, but no cross-engine pixel identity is promised. Browser WebP/AVIF lossless modes and unsupported Mitchell/MKS2021 kernels are **rejected** rather than inaccurately emulated. Default downscaling now uses a bounded, alpha-aware browser Lanczos3 implementation (different from libvips); explicit `nearest` remains available. Embedded ICC metadata is **not preserved** during browser transformations; if the input contains ICC, `colorProfile: 'srgb'` must be explicitly selected. Canvas color management can vary by browser and needs independent validation.

The browser entry imports **no Node built-ins or Sharp code**. Use this entry directly rather than the Node default export in browser-targeted applications. See [browser support policy](docs/browser-adapter.md).

## API

- `createRasterCore({ limits?, engine? })`
- `core.inspect(data: Uint8Array): Promise<ImageInfo>`
- `core.process(data: Uint8Array, request?): Promise<ProcessResult>`
- `core.optimize(data: Uint8Array, options?): Promise<OptimizeResult>`
- `RasterError.code` indicates validation or processing failures.

Default limits: 32 MiB input, 64 million decoded pixels, 64 MiB output. Outputs are newly allocated bytes. No filesystem, network, caching, or remote hosting dependency is imposed by the core API.

**Alpha behavior:** auto output keeps the source format; explicit downscaling keeps aspect ratio; transparent input cannot be encoded to JPEG without `jpegBackground: '#ffffff'` (or another explicit color); animations, SVG, and multi-page documents are rejected. Color fidelity should be verified on representative color-profile samples before production use. Image EXIF metadata is not carried into a re-encoded result by default, reducing metadata leakage; JPEG orientation is physically normalized when transforming.

## Quality policy

See [docs/quality-policy.md](docs/quality-policy.md) for alpha/ICC/orientation regression tests, kernel guidance, and limitations. The adaptive search, strict size budget and local-detail scoring model are described in [docs/optimization.md](docs/optimization.md).

## Quality and performance verification

Run `npm run check` for automated fidelity, optimization and robustness regressions.
Optimization now requires **both** global sampled similarity and salient local-detail similarity to meet the configured `minScore`. Scores differ from alpha.2; they are still only heuristics.
Run `npm run benchmark` for repeatable synthetic image timing/size comparisons;
run `npm run benchmark:browser` for synthetic browser-worker timings, known buffer allocations and UI-frame responsiveness.
use `npm run benchmark -- --iterations=5 --json` for structured results.
Benchmark samples are synthetic and are not a substitute for licensed real-world
photography, color or tiny-text validation. See [docs/benchmarks.md](docs/benchmarks.md).

## Packaging verification

Run `npm run check` followed by `npm run check:package` to build and test an actual npm tarball in an isolated consumer project. The package's Node/browser/header entrypoints and TypeScript declarations are verified independently of repository-relative source paths. This is not proof that the package is already published on npm.

## Roadmap

- `0.2`: quality-focused resizing/color tests and explicit resampling kernels.
- `0.3`: measured quality-versus-size optimization with bounded candidate comparison.
- `0.4`: synthetic performance benchmarks and extended quality/robustness regression coverage (current alpha).
- Next: licensed real-world visual evaluation, independent quality checks and third-party adapter validation.

## Contributing

Please include tests with changes to decoding, validation, or processing. Run `npm run check` before submitting a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
