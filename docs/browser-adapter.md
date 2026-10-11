# Browser adapter policy — 0.5.0-alpha.3

## Platform separation

- Node: existing import from @pfxamd/raster-core, using Sharp/libvips.
- Browser: import from @pfxamd/raster-core/browser, using browser-native createImageBitmap and Canvas/OffscreenCanvas.
- Shared: input copying, limits, request validation, resize planning,
  optimization search, global and local-detail quality metrics.
- Each entry is standalone. The browser graph never imports Sharp or Node APIs.
  Verify with npm run check:browser.

## Supported operations

The first browser adapter accepts **still PNG, JPEG, WebP** when the running
browser can decode them. It inspects encoded headers before calling the
browser decoder, checks pixel caps, and rejects APNG/animated WebP. It can
resize inside bounds and encode PNG, JPEG or WebP only if the native canvas
reports the requested output MIME type. If the browser falls back silently to
PNG, the operation rejects the result. AVIF input and AVIF encoding are not
supported by this first adapter; use the Node engine for AVIF.

- Processing without changes returns an independent byte-identical copy.
- A default resize uses a bounded Lanczos3 RGBA filter, convolving antialiased source pixels and premultiplying alpha before filtering. This runs in 8-bit sRGB space (not linear-light); it differs from libvips and cannot guarantee identical output. The browser
  cannot guarantee exactly matching Sharp/libvips Lanczos3, mks2021 or mitchell implementations;
  explicit requests for mks2021 and mitchell are rejected. The browser now supports its own explicit lanczos3 and nearest; nearest is
  supported.
- JPEG alpha flattening still requires an explicit background.
- Lossless canvas PNG is supported at the rendered pixel representation.
  Native Canvas does **not** expose guaranteed lossless WebP/AVIF encoders;
  requests for these are rejected rather than changing semantics.
- Canvas does not reliably preserve embedded ICC profile bytes. A transform
  of an ICC-tagged input with colorProfile: preserve is refused. Use
  colorProfile: srgb to explicitly authorize browser-native sRGB
  rendering/conversion. Actual pixel color management may differ from
  Sharp/libvips; color proofing is a separate step.
- Optimization shares search limits and dual global/local sampled metrics,
  but codec byte sizes and scores are browser-dependent. Unsupported browser
  codecs are skipped as reported encode-failed candidates. The exact
  minScore does not guarantee legibility or fidelity for all imagery.

## Capability detection

Call probeBrowserRasterCapabilities() to inspect the encoders that the
running browser reports. Availability is per-browser, per-version and may be
different between window and worker contexts. A platform-native encoder is
not equivalent to a deterministic Sharp/libvips codec implementation.

## Validation

- npm run check: Node regression suite plus import-graph/browser build check.
- npm run check:browser:runtime: Chromium integration smoke, requires
  Chrome/Chromium and the prior browser bundle build. Runs encoding,
  inspection, passthrough, resize, adaptive search, transparency, and explicit
  rejection of unsupported requested kernels and AVIF output.
- The cross-platform smoke does not establish identical encoder outputs.
  More testing is needed for EXIF edge cases, diverse color profiles, large
  images and multiple browser families (Firefox/Safari/mobile).

No user-uploaded images are checked into the repository.
