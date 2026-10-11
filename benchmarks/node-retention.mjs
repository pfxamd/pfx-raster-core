/**
 * Measure memory retention in independent Node/Sharp processes. Structural
 * correctness is gated; RSS magnitude/trend is observational only.
 */
import assert from 'node:assert/strict';
import process from 'node:process';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const child = fileURLToPath(new URL('./node-retention-child.mjs', import.meta.url));
const scenarios = ['discard-default','discard-cache-disabled','retain-default'];
const rounds = 2; // fresh process per scenario per round
const runs = [];
let expectedInput = null;
let expectedOutput = null;
for (let round = 1; round <= rounds; round++) {
  // Alternate scenario order to reduce fixed order bias.
  const order = round % 2 ? scenarios : [...scenarios].reverse();
  for (const scenario of order) {
    const execution = spawnSync(process.execPath,
      ['--expose-gc', child, scenario],
      {encoding:'utf8',timeout:90_000,maxBuffer:2*1024*1024});
    if (execution.error) throw execution.error;
    assert.equal(execution.status, 0,
      scenario+' child failed: '+execution.stderr);
    assert.ok(execution.stdout.trim(), scenario+' did not produce a report');
    const sample = JSON.parse(execution.stdout.trim());
    assert.equal(sample.scenario,scenario);
    assert.equal(sample.conversions,24);
    assert.equal(sample.observations.length,5);
    assert.equal(sample.batchDurationMs.length,4);
    assert.deepEqual(sample.observations.map(x=>x.completed),[0,6,12,18,24]);
    for (const point of sample.observations) {
      for (const key of ['rssBytes','heapUsedBytes','externalBytes',
        'arrayBuffersBytes','retainedOutputBytes']) {
        assert.ok(Number.isSafeInteger(point[key]) && point[key]>=0,
          'Invalid '+key);
      }
    }
    if (expectedInput === null) expectedInput = sample.input.sha256;
    if (expectedOutput === null) expectedOutput = sample.output.sha256;
    assert.equal(sample.input.sha256,expectedInput);
    assert.equal(sample.output.sha256,expectedOutput);
    const retained = scenario === 'retain-default';
    assert.equal(sample.observations.at(-1).retainedOutputs,
      retained ? 24 : 0);
    runs.push({round,...sample});
  }
}
assert.equal(runs.length,rounds*scenarios.length);
const report={
  schemaVersion:1,
  kind:'isolated-node-memory-retention-observation',
  runtime:{node:process.version,platform:process.platform,arch:process.arch,
    processors:os.cpus().length,sharp:sharp.versions.sharp,vips:sharp.versions.vips},
  methodology:{
    freshProcessPerScenario:true,
    warmupPerProcess:true,
    requestedV8Gc:true,
    repeatedConversionsPerProcess:24,
    rounds,
    observationsPerProcess:5,
    scenarios,
    interpretation:'RSS deltas in warmed independent processes; expected Sharp caches, native allocator retention, and intentionally held output buffers may cause growth without a leak.',
    doesNotMeasure:'True per-operation peak RSS, isolated native allocation ownership, mobile/browser decoder and GPU memory. No leak verdict from 24 conversions.',
    thresholds:'No pass/fail RSS or timing thresholds on shared CI runners.',
  },
  runs,
};
process.stdout.write(JSON.stringify(report,null,2)+'\n');
