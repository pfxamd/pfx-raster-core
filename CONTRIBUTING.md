# Contributing

PFx Raster Core is an alpha-stage TypeScript project. Contributions should preserve existing image data unless an explicit transformation was requested.

1. Open an issue describing a bug or feature, including image format and expected behavior.
2. Add regression tests for changes in decode, resize, encoding and validation.
3. Run `npm run check` on Node.js 20 or newer before proposing changes.
4. Keep the public core API independent of filesystem, UI and remote services.
5. Do not commit proprietary, personal or licensed sample images without permission.

Security issues involving malicious inputs should be disclosed privately to the maintainer rather than with an exploit file in a public issue.
