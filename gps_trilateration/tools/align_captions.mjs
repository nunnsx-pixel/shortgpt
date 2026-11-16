#!/usr/bin/env node
// Aligns the on-screen caption words to the REAL voice-over timings (out/voice_words.json, from make_voiceover.py)
// and writes src/caption_timing.json (scene-local seconds). The caption text is a shortened version of the spoken
// line, so words are matched in order (accent/punctuation-insensitive, prefix-tolerant); caption words that were not
// spoken are interpolated between their neighbours (or follow the last spoken word).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENES, parseScene } from '../src/captions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const voice = JSON.parse(fs.readFileSync(path.join(ROOT, 'out', 'voice_words.json'), 'utf8'));
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const same = (a, b) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));
const LEAD = 0.05;            // captions appear a hair before the word is heard (reading takes a moment)
const r3 = (x) => Math.round(x * 1000) / 1000;

const out = []; const report = [];
SCENES.forEach((sc, i) => {
  const base = voice.scenes[i].scene_start, dur = voice.scenes[i].scene_duration;          // real start / length of this scene
  const vw = voice.scenes[i].words.map((w) => ({ n: norm(w.text), start: w.start - base, end: w.end - base }));
  const cw = parseScene(i);
  const match = new Array(cw.length).fill(null);
  let p = 0;
  cw.forEach((w, k) => {
    const n = norm(w.text); if (!n) return;
    const win = n.length <= 2 ? 4 : 9;                        // short words (o, a, e) must be close to be a safe match
    for (let j = p; j < Math.min(vw.length, p + win); j++) if (same(n, vw[j].n)) { match[k] = vw[j]; p = j + 1; break; }
  });
  const t = new Array(cw.length);
  for (let k = 0; k < cw.length; k++) if (match[k]) t[k] = { start: Math.max(0.02, match[k].start - LEAD), end: match[k].end };
  // fill the gaps
  for (let k = 0; k < cw.length; k++) {
    if (t[k]) continue;
    let a = k - 1; while (a >= 0 && !t[a]) a--;
    let b = k + 1; while (b < cw.length && !t[b]) b++;
    if (b < cw.length) {                                    // between two spoken words (or before the first)
      const lo = a >= 0 ? t[a].end : Math.max(0.02, t[b].start - 0.5 * (b - a)), hi = t[b].start, n = b - (a >= 0 ? a : -1) - 1;
      const idx = k - (a >= 0 ? a : -1) - 1; const step = (hi - lo) / n;
      t[k] = { start: lo + idx * step, end: lo + (idx + 1) * step };
    } else {                                                // trailing words: follow the last spoken word
      const lastEnd = a >= 0 ? t[a].end : 0.3, idx = k - a - 1, m = cw.length - 1 - a;
      const step = Math.min(0.30, Math.max(0.12, (dur - 0.2 - lastEnd - 0.03) / (m + 0.6)));   // squeeze the unspoken tail in before the cut
      const s0 = Math.min(dur - 0.15, lastEnd + 0.03 + idx * step); t[k] = { start: s0, end: s0 + step };
    }
  }
  for (let k = 1; k < t.length; k++) if (t[k].start < t[k - 1].start) t[k].start = t[k - 1].start;   // monotonic
  out.push(t.map((x) => ({ start: r3(x.start), end: r3(Math.max(x.end, x.start + 0.05)) })));
  report.push(`scene ${String(i + 1).padStart(2)}: ` + cw.map((w, k) => `${w.text}${match[k] ? '' : '*'}@${out[i][k].start.toFixed(2)}`).join(' '));
});
fs.writeFileSync(path.join(ROOT, 'src', 'caption_timing.json'), JSON.stringify(out));
console.log(report.join('\n') + '\n(* = not spoken in the voice-over, interpolated)');
