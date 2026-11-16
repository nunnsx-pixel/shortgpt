#!/usr/bin/env node
// Exports the caption/voice-over timing used by the animation as:
//   out/captions.srt        - one cue per scene (what is burned into the video)
//   out/captions_words.srt  - word-by-word cues (karaoke timing)
//   out/captions.json       - full data (scene, VO line, per-word start/end in absolute seconds)
// Timings are the real voice-over timings (src/caption_timing.json) when present, else the pace-based estimate.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENES, wordsOfScene, plain, setTiming, setSceneTiming, sceneStartsSeconds, sceneFrameList, FPS } from '../src/captions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');
const TF = path.join(ROOT, 'src', 'caption_timing.json');
if (fs.existsSync(TF)) setTiming(JSON.parse(fs.readFileSync(TF, 'utf8')));      // real voice-over timings
const SF = path.join(ROOT, 'src', 'scene_timing.json');
if (fs.existsSync(SF)) { const j = JSON.parse(fs.readFileSync(SF, 'utf8')); setSceneTiming(j.frames, j.cues || {}); }
const STARTS = sceneStartsSeconds(), DURS = sceneFrameList().map((n) => n / FPS);
fs.mkdirSync(OUT, { recursive: true });
const ts = (s) => {
  const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(sec)},${p(r, 3)}`;
};

let srt = '', wsrt = '', n = 1, wn = 1;
const json = SCENES.map((sc, i) => {
  const base = STARTS[i], words = wordsOfScene(i);
  srt += `${n++}\n${ts(base)} --> ${ts(base + DURS[i] - 0.04)}\n${plain(i)}\n\n`;
  words.forEach((w) => { wsrt += `${wn++}\n${ts(base + w.start)} --> ${ts(base + w.end)}\n${w.text}\n\n`; });
  return { scene: sc.id, title: sc.title, start: +base.toFixed(3), end: +(base + DURS[i]).toFixed(3), voiceover: sc.vo, caption: plain(i), words: words.map((w) => ({ text: w.text, accent: w.cls || null, start: +(base + w.start).toFixed(3), end: +(base + w.end).toFixed(3) })) };
});
fs.writeFileSync(path.join(OUT, 'captions.srt'), srt);
fs.writeFileSync(path.join(OUT, 'captions_words.srt'), wsrt);
fs.writeFileSync(path.join(OUT, 'captions.json'), JSON.stringify(json, null, 2));
console.log(`wrote ${SCENES.length} scenes -> out/captions.srt, out/captions_words.srt, out/captions.json`);
