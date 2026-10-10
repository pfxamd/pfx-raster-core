# PFx Raster Core

Independent, open-source raster processing core for safe, reusable image transformations.

**Status:** `0.1.0-alpha.1` — experimental. The repository contains source code; no npm publication is implied.

## Scope

- JPEG, PNG, WebP, and AVIF **still images**.
- Inspect orientation-aware dimensions, alpha, and embedded ICC profile presence.
- Resize within specified bounds without cropping or enlargement.
- Encode to an explicit format, with optional quality or lossless mode.
- Preserve embedded ICC profiles by default, or convert explicitly to sRGB.
- Validate input signatures, dimension limits and generated results.
- Preserve the original bytes. If no transformation is needed, return a byte-identical copy.

This is **not** an AI upscaler, denoiser, subjective-quality optimizer, or image storage system. Those are separate possible future layers. It does not promise perceptual equivalence after lossy encoding.

## Install from source

```bash
npm install
npm run check
```

Node.js 20+ is required. The first implementation uses Sharp and libvips; the public API also accepts a separate processing engine.

## Example

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { createRasterCore } from '@pfxamd/raster-core';

const core = createRasterCore();
const input = await readFile('original.png');
const metadata = await core.inspect(input);

const result = await core.process(input, {
  resize: { width: 1200, height: 1200 },
  format: 'webp',
  quality: 85
});

await writeFile('display.webp', result.data);
console.log(metadata, result.output, result.passthrough);
```

The package name above is a **planned package identifier**, not a claim of public npm availability. During development, import from a local checkout/workspace package.

## API

- `createRasterCore({ limits?, engine? })`
- `core.inspect(data: Uint8Array): Promise<ImageInfo>`
- `core.process(data: Uint8Array, request?): Promise<ProcessResult>`
- `RasterError.code` indicates validation or processing failures.

Default limits: 32 MiB input, 64 million decoded pixels, 64 MiB output. Outputs are newly allocated bytes. No filesystem, network, caching, or remote hosting dependency is imposed by the core API.

**Alpha behavior:** auto output keeps the source format; explicit downscaling keeps aspect ratio; transparent input cannot be encoded to JPEG without `jpegBackground: '#ffffff'` (or another explicit color); animations, SVG, and multi-page documents are rejected. Color fidelity should be verified on representative color-profile samples before production use. Image EXIF metadata is not carried into a re-encoded result by default, reducing metadata leakage; JPEG orientation is physically normalized when transforming.

## Roadmap

- `0.2`: quality-focused resizing/color tests and additional controlled transforms.
- `0.3`: measurable quality-versus-size optimization and candidate comparison.
- `0.4`: benchmarks, robustness, documented third-party adapter validation.

## Contributing

Please include tests with changes to decoding, validation, or processing. Run `npm run check` before submitting a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
