#!/usr/bin/env node
// Renders frames of the animation with headless Chromium (software WebGL / SwiftShader).
//   node tools/render.mjs --frames 0-1799 --workers 3 --out frames
//   node tools/render.mjs --frames 20,170,320 --out preview --scale 0.5
// Every frame is a pure function of its index, so frames can be rendered in any order, in parallel, and resumed.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']] : a), []));
const OUT = path.resolve(args.out || 'frames');
const WORKERS = parseInt(args.workers || '3', 10);
const SCALE = parseFloat(args.scale || '1');
const QUALITY = parseInt(args.quality || '95', 10);
const FORMAT = args.format || 'jpeg';
const frames = [];
for (const part of (args.frames || '0-1799').split(',')) {
  const [a, b] = part.split('-').map(Number); for (let i = a; i <= (b ?? a); i++) frames.push(i);
}
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html?scale=${SCALE}`;

const name = (f) => path.join(OUT, `frame_${String(f).padStart(5, '0')}.${FORMAT === 'png' ? 'png' : 'jpg'}`);
const todo = frames.filter((f) => !(fs.existsSync(name(f)) && fs.statSync(name(f)).size > 2000));
console.log(`frames: ${frames.length} requested, ${todo.length} to render, ${WORKERS} workers, scale ${SCALE}`);

let done = 0; const t0 = Date.now();
async function worker(k) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && k === 0) console.log(`[page ${m.type()}]`, m.text().slice(0, 400)); });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 600)));
  await page.goto(base);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
  const err = await page.evaluate(() => window.__error); if (err) throw new Error('page failed to init: ' + err);
  for (let i = k; i < todo.length; i += WORKERS) {
    const f = todo[i];
    await page.evaluate((fr) => window.renderFrame(fr), f);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const buf = await page.screenshot(FORMAT === 'png' ? { type: 'png' } : { type: 'jpeg', quality: QUALITY });
    fs.writeFileSync(name(f), buf);
    done++;
    if (done % 10 === 0 || done === todo.length) {
      const el = (Date.now() - t0) / 1000, eta = (el / done) * (todo.length - done);
      console.log(`  ${done}/${todo.length}  ${(el / done).toFixed(2)} s/frame  elapsed ${(el / 60).toFixed(1)} min  eta ${(eta / 60).toFixed(1)} min`);
    }
  }
  await browser.close();
}
try { await Promise.all(Array.from({ length: Math.min(WORKERS, Math.max(1, todo.length)) }, (_, k) => worker(k))); }
finally { server.close(); }
console.log('done');
