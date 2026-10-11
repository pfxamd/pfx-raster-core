# Distribution and API contract

**Release:** `0.6.0-alpha.1` (experimental). The canonical distribution channel is **GitHub Releases**, not an npm registry. No external account or manual publish commands are required.

## Supported imports

| Import | Runtime | Contract |
| --- | --- | --- |
| `@pfxamd/raster-core` | Node >=20 (Sharp/libvips) | `createRasterCore`, `RasterCore`, `RasterError`, `SharpEngine`, optimization helpers and shared types |
| `@pfxamd/raster-core/browser` | Browser Worker / Canvas or OffscreenCanvas | `createRasterCore`, `RasterCore`, `BrowserEngine`, pixel processing and resampling exports |
| `@pfxamd/raster-core/browser/header` | Browser or Node without a raster decoder | `inspectRasterHeader(input: Uint8Array, limits?: Partial<CoreLimits>): ImageInfo` |

The root entrypoint depends on Node/Sharp. Browser bundles must remain free of Sharp and Node built-ins. The structural-header API **does not decode or authenticate image pixels**. Internal `src/`, `dist/`, `tests/` modules are not public API paths.

## Versioning and compatibility

- The `package.json` version is the release identifier. A successful `CI` push to `main` automatically generates `v<version>` and attaches a tested compiled archive if that version has not already been released.
- A release tag and attached archive are immutable version references. Later code changes with the same version do **not** overwrite an existing release. Bump the version to distribute new code.
- Exact prerelease versions must be tested in consumers before migration. Compatibility in alpha is a goal but not an unconditional SemVer guarantee.
- Preserve external exports, input and result contracts, error codes, original-byte ownership, input/output limits, ICC explicit conversion consent, and alpha/orientation semantics.
- Node and browser implementations may produce different bytes and do not promise cross-engine encoding parity.

## Automated release pipeline

The `.github/workflows/release.yml` workflow listens for a **successful push-to-main CI** run. It checks that the tested commit is still current, skips a version that already has a release, builds and tests the package again, tests the real installed tarball and browser runtime, and publishes `pfxamd-raster-core-<version>.tgz` plus a `.sha256` checksum as GitHub Release assets. This is a distribution of compiled files, not a Git source snapshot. A failed check blocks publishing. No npm registry credentials are used.

Release asset URL pattern:

```text
https://github.com/pfxamd/pfx-raster-core/releases/download/v0.6.0-alpha.1/pfxamd-raster-core-0.6.0-alpha.1.tgz
```

Use that exact URL (or the newer version's exact URL) as a package-manager dependency for browser/Node consumers. It retains imports under the same `@pfxamd/raster-core` package name while eliminating raw commit-SHA dependencies. Verify the asset's availability and integration tests **before** changing each dependent application. The release archive is publicly available without npm login; internet access to GitHub is still required for a fresh installation.

## Package validation

```bash
npm install
npm run check
npm run check:package
npm run check:browser:runtime
```

The package smoke test builds a tarball, installs it in an isolated directory, imports all three entrypoints and typechecks an external consumer. CI also runs Node 20 and 22 tests, bundles and real-browser checks. Synthetic test fixtures are used; private imagery is never included.

## Rollout policy

Keep existing consumer pin until the versioned release file has been downloaded and its actual archive tested. Update Image Studio and Image Inspector separately, run their tests and deploy smoke checks. Do not change conversion algorithms or UI during a dependency migration.
