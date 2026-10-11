/** Synthetic browser benchmark: report time and known buffer sizes; do not gate
 * on absolute timings, which are machine-dependent. A separate worker keeps UI
 * responsive during CPU-intensive Lanczos3 filtering.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const bundle = readFileSync(new URL('../dist/browser-bundle.mjs', import.meta.url));
const workerSource = [
  "import { resizeRgbaLanczos3 } from '/browser-bundle.mjs';",
  "self.onmessage = ({data}) => {",
  "  const {width,height,targetWidth,targetHeight}=data;",
  "  try {",
  "    const input=new Uint8ClampedArray(width*height*4);",
  "    for(let y=0;y<height;y++)for(let x=0;x<width;x++){",
  "      const i=(y*width+x)*4;",
  "      input[i]=(x*5+y*3)&255;input[i+1]=(x^y)&255;",
  "      input[i+2]=(y*7)&255;input[i+3]=x%23===0?150:255;",
  "    }",
  "    const start=performance.now();",
  "    const out=resizeRgbaLanczos3(input,width,height,targetWidth,targetHeight);",
  "    self.postMessage({durationMs:performance.now()-start,sourceBytes:input.byteLength,",
  "      outputBytes:out.data.byteLength,outputWidth:out.width,outputHeight:out.height,",
  "      intermediatePixels:Math.min(targetWidth*height,width*targetHeight)});",
  "  } catch(error){self.postMessage({error:String(error)});}",
  "};"
].join('\n');

const server = createServer((request, response) => {
  if (request.url === '/browser-bundle.mjs') {
    response.writeHead(200, { 'Content-Type': 'application/javascript' });
    response.end(bundle);
  } else if (request.url === '/benchmark-worker.js') {
    response.writeHead(200, { 'Content-Type': 'application/javascript' });
    response.end(workerSource);
  } else {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><title>PFx Raster benchmark</title>');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server port');
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:' + address.port + '/');
  const report = await page.evaluate(async () => {
    const workloads = [
      {width:1536,height:1153,targetWidth:1200,targetHeight:901},
      {width:2400,height:1600,targetWidth:1200,targetHeight:800},
      {width:4000,height:3000,targetWidth:1200,targetHeight:900}
    ];
    const results = [];
    for (const work of workloads) {
      const worker = new Worker('/benchmark-worker.js', { type: 'module' });
      let frames = 0;
      let running = true;
      const frame = () => {
        if (running) { frames++; requestAnimationFrame(frame); }
      };
      requestAnimationFrame(frame);
      try {
        const result = await new Promise((resolve, reject) => {
          worker.onerror = error => reject(new Error(error.message));
          worker.onmessage = ({data}) => data.error ? reject(new Error(data.error)) : resolve(data);
          worker.postMessage(work);
        });
        results.push({
          ...work, ...result,
          uiFrames: frames,
          intermediateFloatBytes: result.intermediatePixels * 16,
          removedSecondFloatBytes: result.outputBytes * 4
        });
      } finally {
        running = false;
        worker.terminate();
      }
    }
    return results;
  });
  for (const row of report) {
    if (!Number.isFinite(row.durationMs) || row.durationMs < 0 ||
        row.outputBytes !== row.targetWidth * row.targetHeight * 4 ||
        row.uiFrames < 1) {
      throw new Error('Invalid benchmark or stalled main-thread UI');
    }
  }
  process.stdout.write(JSON.stringify({
    test: 'browser-worker-synthetic-lanczos',
    browser: await browser.version(),
    caveat: 'Timings are observational; byte counts describe allocated arrays, not measured peak process RSS.',
    results: report
  }, null, 2) + '\n');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
