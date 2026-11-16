// DOM caption renderer shared by the 3D page (burned-in preview) and the transparent caption-overlay page.
import { wordsOfScene, setTiming } from './captions.js';
import { clamp, smooth } from './util.js';

export async function loadTiming(url = './src/caption_timing.json') {
  try { const r = await fetch(url); if (r.ok) setTiming(await r.json()); } catch (e) { /* estimated timings are used */ }
}

export function makeCaptions(capEl) {
  let capScene = -1, capWords = [], capSpans = [];
  function build(sc) {
    capEl.innerHTML = ''; capWords = wordsOfScene(sc); capSpans = [];
    capWords.forEach((w) => { const s = document.createElement('span'); s.className = 'w ' + w.cls; s.textContent = w.text; capEl.appendChild(s); capEl.appendChild(document.createTextNode(' ')); capSpans.push(s); });
    capScene = sc;
  }
  return function update(sc, t) {
    if (sc !== capScene) build(sc);
    capWords.forEach((w, i) => {
      const s = capSpans[i], a = t - w.start;
      if (a < 0) { s.style.opacity = '0'; return; }
      const pop = clamp(a / 0.2);
      const sc2 = 1 + 0.11 * (1 - smooth(pop)) + (t < w.end ? 0.04 : 0);
      s.style.opacity = String(clamp(a / 0.08));
      s.style.transform = `scale(${sc2.toFixed(3)}) translateY(${((1 - smooth(pop)) * 8).toFixed(1)}px)`;
      s.style.color = w.cls ? '' : (t < w.end ? '#fff7b0' : '#ffffff');
    });
  };
}
