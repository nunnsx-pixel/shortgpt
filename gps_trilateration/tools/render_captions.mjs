#!/usr/bin/env node
// Renders ONLY the caption layer as transparent PNGs (captions.html, no WebGL): fast, so captions/voice can be
// re-timed without re-rendering the 3D frames.   node tools/render_captions.mjs --out captions_frames --workers 3
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']] : a), []));
const OUT = path.resolve(args.out || 'captions_frames'), WORKERS = parseInt(args.workers || '3', 10), N = 1800;
fs.mkdirSync(OUT, { recursive: true });
if (args.force) for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'captions.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/captions.html`;
const name = (f) => path.join(OUT, `cap_${String(f).padStart(5, '0')}.png`);
const todo = Array.from({ length: N }, (_, i) => i).filter((f) => !(fs.existsSync(name(f)) && fs.statSync(name(f)).size > 0));
console.log(`caption frames: ${todo.length} to render`);
let done = 0; const t0 = Date.now();
async function worker(k) {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));
  await page.goto(url); await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
  for (let i = k; i < todo.length; i += WORKERS) {
    await page.evaluate((fr) => window.renderFrame(fr), todo[i]);
    fs.writeFileSync(name(todo[i]), await page.screenshot({ type: 'png', omitBackground: true }));
    if (++done % 200 === 0) console.log(`  ${done}/${todo.length}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  await browser.close();
}
try { await Promise.all(Array.from({ length: Math.min(WORKERS, Math.max(1, todo.length)) }, (_, k) => worker(k))); } finally { server.close(); }
console.log('done');
