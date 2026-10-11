/**
 * Read-only public npm registry probe. Does not authorize publishing or infer
 * account ownership. Intended to ground release preparation in actual status.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const registryUrl = 'https://registry.npmjs.org/' + encodeURIComponent(manifest.name);
const response = await fetch(registryUrl, {
  headers: { accept: 'application/vnd.npm.install-v1+json' },
  signal: AbortSignal.timeout(20_000),
});
if (response.status === 404) {
  console.log('PUBLIC_NPM_REGISTRY_STATUS', JSON.stringify({
    package: manifest.name,
    status: 'not_publicly_resolvable',
    httpStatus: 404,
    publicationOrScopeOwnership: 'unverified',
  }));
} else if (!response.ok) {
  throw new Error('npm registry returned unexpected HTTP ' + response.status);
} else {
  const metadata = await response.json();
  if (metadata.name !== manifest.name) {
    throw new Error('npm registry returned mismatched package identity');
  }
  const versions = Object.keys(metadata.versions ?? {});
  console.log('PUBLIC_NPM_REGISTRY_STATUS', JSON.stringify({
    package: manifest.name,
    status: 'publicly_resolvable',
    httpStatus: 200,
    publishedVersionCount: versions.length,
    localVersionAlreadyPublished: versions.includes(manifest.version),
    tags: metadata['dist-tags'] ?? {},
    publicationOrScopeOwnership: 'unverified',
  }));
}
