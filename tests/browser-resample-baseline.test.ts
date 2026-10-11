import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resizeRgbaLanczos3 } from '../src/browser/resample.js';

/**
 * Pre-change (0.5.0-alpha.5) output digests, generated with its previous
 * implementation, not produced from the new fast path.
 *
 * These exercise both pass orientations, partially transparent pixels, one
 * transparent pixel at the very END of a buffer, opaque photos and thin lines.
 */
const FIXTURES = [
  {
    name: 'opaque-small', width: 97, height: 73, targetWidth: 41, targetHeight: 29,
    kind: 'opaque', expected: '00ec6759cd4ccc875cefe88d4d6e721e2426d084763e04ff1d223d39b43ce9e8'
  },
  {
    name: 'alpha-gradient', width: 93, height: 67, targetWidth: 38, targetHeight: 28,
    kind: 'alpha', expected: '57d22eccf1e0e1ac3036b066158dbf4d5c567737f5357a7d32551c1842cc200f'
  },
  {
    name: 'opaque-with-one-transparent-at-end', width: 43, height: 71, targetWidth: 31,
    targetHeight: 19, kind: 'late',
    expected: 'a0532b69b73da22f41e90a33a454c78afeb4f81994bebf9e2eb7e36117124275'
  },
  {
    name: 'sharp-vertical', width: 130, height: 180, targetWidth: 115,
    targetHeight: 64, kind: 'alpha',
    expected: '2eda383818b22a6d8d8c1e9d3cf9bd124bf099c917ee9ce3b0e346a29e586466'
  },
  {
    name: 'fine-lines', width: 96, height: 64, targetWidth: 48, targetHeight: 32,
    kind: 'lines',
    expected: '15781f38e0311a903441558c896d17f9c40c52c957024eac645aabb6c45f4b51'
  }
] as const;

for (const fixture of FIXTURES) {
  test('Lanczos3 retains exact baseline RGBA bytes: ' + fixture.name, () => {
    const { width, height, targetWidth, targetHeight, kind } = fixture;
    const source = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        source[i] = (x * 5 + y * 3) & 255;
        source[i + 1] = (x ^ y) & 255;
        source[i + 2] = (y * 7 + x) & 255;
        source[i + 3] = kind === 'alpha' ? (x * 37 + y * 11) & 255 :
          kind === 'late' && x === width - 1 && y === height - 1 ? 127 : 255;
        if (kind === 'lines' && (x % 13 === 0 || y % 37 === 0)) {
          source[i] = source[i + 1] = source[i + 2] = 0;
        }
      }
    }
    const original = source.slice();
    const result = resizeRgbaLanczos3(source, width, height, targetWidth, targetHeight);
    assert.deepEqual(source, original, 'source buffer must never be mutated');
    assert.equal(result.width, targetWidth);
    assert.equal(result.height, targetHeight);
    assert.equal(result.data.length, targetWidth * targetHeight * 4);
    assert.equal(createHash('sha256').update(result.data).digest('hex'), fixture.expected,
      'all RGBA bytes must match the pre-optimization algorithm exactly');
  });
}
