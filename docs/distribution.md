# Distribution and API contract

Status: 0.5.0-alpha.8 is **pre-release**, and this repository does not claim that any npm version has been published.

## Public package imports

| Entrypoint | Runtime | Public contract |
| --- | --- | --- |
| @pfxamd/raster-core | Node >=20 with Sharp/libvips | createRasterCore, RasterCore, RasterError, SharpEngine, optimization helpers and shared types |
| @pfxamd/raster-core/browser | Browser worker/DOM or OffscreenCanvas | createRasterCore, RasterCore, BrowserEngine, pixel/resample functions and browser types |
| @pfxamd/raster-core/browser/header | Browser or Node without pixel decoder | inspectRasterHeader(input: Uint8Array, limits?: Partial<CoreLimits>): ImageInfo |

The root import is NOT browser-safe. The browser and browser/header bundles must not contain Sharp or Node built-ins. The header import checks structural fields and limits only; it does not decode pixels or prove full file integrity.

The public types are the named exports from the three subpaths. Other paths under dist/, src/, tests/ and internal implementation modules are not part of the contract.

## Alpha compatibility policy

- Patch changes within the same alpha series should retain declared public exports, argument types and result shapes unless an intentional versioned breaking change is documented.
- Until 1.0, backwards compatibility is an engineering goal, not a blanket SemVer guarantee. Consumers should pin an **exact** pre-release package version and upgrade only after their tests pass.
- Do not silently weaken limits, input byte ownership, orientation rules, explicit ICC conversion consent, alpha handling, or public error codes.
- Node and browser codecs/resamplers are different and cannot promise identical encoded bytes.

## Verify a distributable

After npm install in a clean checkout:

1. Run npm run check (unit, quality and browser bundle checks).
2. Run npm run check:package (pack, install the real archive in an isolated consumer, import every public entrypoint and compile a separate TypeScript consumer).
3. Run npm run check:browser:runtime for a real Chromium smoke test.

No private images are used. CI runs the packaged-consumer test for Node 22 in addition to its existing tests. These checks validate the build artifact, not npm registry availability.

## Publishing gate

The publish.yml workflow only runs after someone pushes a matching v-prefixed release tag (for example v0.5.0-alpha.8). It verifies tag = package.json version, executes checks, verifies the packed consumer, and publishes with the npm dist-tag alpha rather than latest. Node 24 and npm >=11.15 are used for GitHub OIDC trusted publishing without stored npm publish tokens.

The npm package must first exist under the intended @pfxamd scope with authorized ownership. For a first publication this normally requires a one-time authenticated npm bootstrap. Configure a GitHub Actions trusted publisher on npmjs.com for user pfxamd, repository pfx-raster-core, and workflow filename publish.yml; authorize direct npm publish, not stage-only. Verify the package's repository linkage. **Do not push the release tag before this is configured.** The CI workflow cannot establish registry ownership or trusted-publisher settings by itself.

After registry publication, verify the exact version and full import tests from the registry in both downstream applications on branches before replacing Git SHA pins. Keep existing pins until that evidence exists.
