import * as THREE from 'three';
import { mulberry32, clamp, smooth, range, lerp } from './util.js';

export const COL = { bg: '#050505', cyan: '#00F0FF', red: '#FF003C' };

function canvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------------ glow sprite
export function makeGlowTexture() {
  const c = canvas(256, 256), g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.14)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return tex(c, false);
}

// ------------------------------------------------------------------ Earth land mask (R = land fill, G = coast line)
function decodeTopo(topo) {
  const [sx, sy] = topo.transform.scale, [tx, ty] = topo.transform.translate;
  const arcs = topo.arcs.map((arc) => { let x = 0, y = 0; return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; }); });
  const ring = (idx) => {
    const pts = [];
    idx.forEach((i) => { let a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; if (pts.length) a = a.slice(1); pts.push(...a); });
    return pts;
  };
  const polys = [];
  const geoms = topo.objects.land.geometries || [topo.objects.land];
  geoms.forEach((g) => {
    if (g.type === 'Polygon') polys.push(g.arcs.map(ring));
    else if (g.type === 'MultiPolygon') g.arcs.forEach((p) => polys.push(p.map(ring)));
  });
  return polys;
}

export async function makeLandTexture(url) {
  const topo = await (await fetch(url)).json();
  const polys = decodeTopo(topo);
  const W = 2048, H = 1024;
  const c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const px = (lon) => ((lon + 180) / 360) * W, py = (lat) => ((90 - lat) / 180) * H;
  g.fillStyle = '#f00';
  polys.forEach((rings) => {
    g.beginPath();
    rings.forEach((r) => { r.forEach(([lo, la], i) => (i ? g.lineTo(px(lo), py(la)) : g.moveTo(px(lo), py(la)))); g.closePath(); });
    g.fill('evenodd');
  });
  // coast line (skip the artificial cuts along the antimeridian and the south pole)
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = '#0f0'; g.lineWidth = 2.4; g.lineJoin = 'round';
  polys.forEach((rings) => rings.forEach((r) => {
    g.beginPath();
    let pen = false;
    for (let i = 1; i < r.length; i++) {
      const [a, b] = [r[i - 1], r[i]];
      const cut = Math.abs(a[0] - b[0]) > 180 || (Math.abs(a[0]) > 179.9 && Math.abs(b[0]) > 179.9) || (a[1] < -89.5 && b[1] < -89.5);
      if (cut) { pen = false; continue; }
      if (!pen) { g.moveTo(px(a[0]), py(a[1])); pen = true; }
      g.lineTo(px(b[0]), py(b[1]));
    }
    g.stroke();
  }));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8;
  return t;
}

// ------------------------------------------------------------------ satellite solar panel
export function makeSolarTexture() {
  const c = canvas(256, 256), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 256, 256);
  gr.addColorStop(0, '#102a63'); gr.addColorStop(0.5, '#0a1c46'); gr.addColorStop(1, '#0d2455');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(150,190,230,0.55)'; g.lineWidth = 1.2;
  for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 256); g.stroke(); }
  for (let j = 0; j <= 8; j++) { g.beginPath(); g.moveTo(0, j * 32); g.lineTo(256, j * 32); g.stroke(); }
  g.strokeStyle = 'rgba(210,225,245,0.22)'; g.lineWidth = 0.6;
  for (let i = 0; i < 8; i++) for (let k = 1; k < 3; k++) { g.beginPath(); g.moveTo(i * 32 + k * 10.6, 0); g.lineTo(i * 32 + k * 10.6, 256); g.stroke(); }
  const t = tex(c); return t;
}

// ------------------------------------------------------------------ phone internals
export function makePcbTexture() {
  const c = canvas(512, 1024), g = c.getContext('2d'), rnd = mulberry32(42);
  g.fillStyle = '#06222c'; g.fillRect(0, 0, 512, 1024);
  g.lineCap = 'round';
  for (let i = 0; i < 160; i++) {
    let x = rnd() * 512, y = rnd() * 1024;
    g.strokeStyle = rnd() < 0.2 ? 'rgba(0,240,255,0.55)' : 'rgba(30,140,160,0.45)';
    g.lineWidth = 1.5 + rnd() * 2;
    g.beginPath(); g.moveTo(x, y);
    const n = 2 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      if (rnd() < 0.5) x += (rnd() - 0.5) * 160; else y += (rnd() - 0.5) * 160;
      g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = 'rgba(210,170,80,0.8)'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill();
  }
  for (let i = 0; i < 90; i++) {
    g.fillStyle = 'rgba(210,170,80,0.7)'; g.fillRect(rnd() * 500, rnd() * 1010, 5 + rnd() * 6, 3 + rnd() * 4);
  }
  return tex(c);
}

export function makeLabelTexture(text, w = 256, h = 256, color = '#9fb4c4', bg = '#0b1218', size = 26) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 3; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = color; g.font = `700 ${size}px Montserrat, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2);
  return tex(c);
}

// ------------------------------------------------------------------ city (scene 10)
export function makeWindowTexture(seed = 7) {
  const c = canvas(128, 256), g = c.getContext('2d'), rnd = mulberry32(seed);
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 256);
  for (let y = 6; y < 250; y += 14) for (let x = 6; x < 122; x += 14) {
    const r = rnd();
    if (r < 0.38) {
      g.fillStyle = r < 0.07 ? '#ff7b5a' : r < 0.2 ? '#bff6ff' : '#4fb8d8';
      g.globalAlpha = 0.45 + rnd() * 0.55;
      g.fillRect(x, y, 8, 9);
    }
  }
  g.globalAlpha = 1;
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// ------------------------------------------------------------------ HUD label sprite (scene 9)
export class HudLabel {
  constructor(w = 640, h = 150) {
    this.w = w; this.h = h;
    this.c = canvas(w, h); this.g = this.c.getContext('2d');
    this.texture = tex(this.c);
    this.mat = new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.scale.set(w / h * 0.42, 0.42, 1);
    this._key = '';
  }
  draw(label, value, p, accent = '#00F0FF') {
    const key = `${label}|${value}|${p.toFixed(2)}`;
    if (key === this._key) return; this._key = key;
    const { g, w, h } = this;
    g.clearRect(0, 0, w, h);
    const k = smooth(range(p, 0, 0.25));
    g.fillStyle = 'rgba(0,30,40,0.55)';
    g.beginPath(); g.roundRect(8, 8, (w - 16) * k, h - 16, 18); g.fill();
    g.strokeStyle = accent; g.lineWidth = 3; g.beginPath(); g.roundRect(8, 8, (w - 16) * k, h - 16, 18); g.stroke();
    if (p > 0.2) {
      g.textBaseline = 'middle';
      if (label) { g.fillStyle = '#7fe9f2'; g.font = '700 30px Montserrat, sans-serif'; g.fillText(label, 36, h * 0.36); }
      const n = Math.floor(value.length * smooth(range(p, 0.25, 1)));
      g.fillStyle = '#ffffff'; g.font = '800 62px Montserrat, sans-serif';
      g.fillText(value.slice(0, n) + (n < value.length ? '_' : ''), 40, label ? h * 0.70 : h * 0.54);
    }
    this.texture.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ the phone screen (map UI)
export const SCREEN_W = 592, SCREEN_H = 1312;   // matches the 0.77 x 1.67 screen plane aspect

export class MapScreen {
  constructor() {
    this.canvas = canvas(SCREEN_W, SCREEN_H);
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.map = this._buildMap();
  }

  _buildMap() {
    const MW = 900, MH = 1500, c = canvas(MW, MH), g = c.getContext('2d'), rnd = mulberry32(2024);
    g.fillStyle = '#081620'; g.fillRect(0, 0, MW, MH);
    // water
    g.fillStyle = '#071f2e'; g.beginPath(); g.moveTo(-10, 980); g.bezierCurveTo(250, 880, 450, 1120, 910, 1010); g.lineTo(910, 1220); g.bezierCurveTo(500, 1300, 300, 1100, -10, 1190); g.fill();
    // parks
    g.fillStyle = '#0b2a27';
    [[90, 240, 210, 140], [560, 420, 220, 170], [330, 1220, 260, 150]].forEach(([x, y, w, h]) => { g.beginPath(); g.roundRect(x, y, w, h, 28); g.fill(); });
    // blocks
    for (let i = 0; i < 260; i++) {
      const x = rnd() * MW, y = rnd() * MH, w = 28 + rnd() * 70, h = 22 + rnd() * 60;
      g.fillStyle = `rgba(20,52,72,${0.35 + rnd() * 0.35})`; g.fillRect(x, y, w, h);
    }
    // street grid
    const road = (x1, y1, x2, y2, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
    for (let i = 0; i < 26; i++) { const y = i * 60 + (rnd() - 0.5) * 24; road(-20, y, MW + 20, y + (rnd() - 0.5) * 40, 3 + rnd() * 3, '#143447'); }
    for (let i = 0; i < 16; i++) { const x = i * 60 + (rnd() - 0.5) * 24; road(x, -20, x + (rnd() - 0.5) * 40, MH + 20, 3 + rnd() * 3, '#143447'); }
    road(-20, 540, MW + 20, 700, 14, '#143a4c'); road(-20, 540, MW + 20, 700, 2.5, '#1d5a74');
    road(220, -20, 520, MH + 20, 12, '#143a4c'); road(220, -20, 520, MH + 20, 2.2, '#1d5a74');
    road(-20, 250, MW + 20, 150, 10, '#10303f');
    // labels
    g.font = '600 20px Montserrat, sans-serif'; g.fillStyle = 'rgba(160,200,220,0.55)';
    g.fillText('Av. Paulista', 560, 640); g.fillText('R. Augusta', 90, 330); g.fillText('Parque', 120, 320);
    g.save(); g.translate(210, 900); g.rotate(-1.25); g.fillText('R. da Consolação', 0, 0); g.restore();
    return c;
  }

  /**
   * state: { t, glitch, send (0..1 red transmit icon), dot (0..1 visible), lock (0..1), ripple (0..1 phase or -1), sheet (0..1), pan }
   */
  paint(s) {
    const g = this.g, W = SCREEN_W, H = SCREEN_H, t = s.t || 0;
    g.save();
    g.clearRect(0, 0, W, H);
    // rounded screen clip (black bezel built into the texture)
    g.fillStyle = '#000'; g.beginPath(); g.roundRect(0, 0, W, H, 78); g.fill();
    g.beginPath(); g.roundRect(10, 10, W - 20, H - 20, 70); g.clip();

    const panX = (s.pan || 0) * 30 + Math.sin(t * 0.4) * 6, panY = Math.cos(t * 0.33) * 8;
    const mx = -(this.map.width - W) / 2 + panX, my = -(this.map.height - H) / 2 + panY;
    if (s.glitch > 0.05) {
      // sliced + displaced map for the digital glitch
      const rnd = mulberry32(Math.floor(t * 30) * 13 + 5);
      const slices = 22;
      for (let i = 0; i < slices; i++) {
        const sy = (H / slices) * i, off = rnd() < s.glitch * 0.6 ? (rnd() - 0.5) * 140 * s.glitch : 0;
        g.drawImage(this.map, -mx, -my + sy, W, H / slices + 1, off, sy, W, H / slices + 1);
      }
      for (let i = 0; i < 26 * s.glitch; i++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(255,0,60,0.45)' : 'rgba(0,240,255,0.4)';
        g.fillRect(rnd() * W, rnd() * H, 20 + rnd() * 120, 4 + rnd() * 26);
      }
      for (let i = 0; i < 60 * s.glitch; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.5})`; const b = 8 + rnd() * 18; g.fillRect(Math.floor(rnd() * W / 8) * 8, Math.floor(rnd() * H / 8) * 8, b, b); }
    } else {
      g.drawImage(this.map, mx, my);
    }
    // vignette on the screen itself
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);

    const cx = W / 2, cy = H * 0.5 - 40;

    // ---- red "transmit" icon (the myth)
    if (s.send > 0.01) {
      const k = s.send;
      g.save(); g.globalAlpha = k;
      for (let i = 0; i < 3; i++) {
        const ph = (t * 1.6 + i / 3) % 1;
        g.strokeStyle = `rgba(255,0,60,${(1 - ph) * 0.9})`; g.lineWidth = 6;
        g.beginPath(); g.arc(cx, cy, 50 + ph * 190, 0, Math.PI * 2); g.stroke();
      }
      g.fillStyle = '#ff003c'; g.shadowColor = '#ff003c'; g.shadowBlur = 40;
      g.beginPath(); g.arc(cx, cy, 58, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(cx, cy - 32); g.lineTo(cx + 30, cy + 2); g.lineTo(cx + 12, cy + 2); g.lineTo(cx + 12, cy + 30); g.lineTo(cx - 12, cy + 30); g.lineTo(cx - 12, cy + 2); g.lineTo(cx - 30, cy + 2); g.closePath(); g.fill();
      g.restore();
    }

    // ---- blue location dot
    if (s.dot > 0.001) {
      const lock = s.lock || 0;
      const roam = (1 - lock);
      const dx = Math.sin(t * 3.1) * 70 * roam + Math.sin(t * 7.3) * 14 * roam;
      const dy = Math.cos(t * 2.3) * 90 * roam + Math.cos(t * 5.9) * 16 * roam;
      const x = cx + dx, y = cy + dy;
      const pop = s.dot < 1 ? 1 + 0.45 * Math.sin(Math.PI * s.dot) : 1;
      const accR = lerp(150, 46, smooth(lock)) * (0.92 + 0.08 * Math.sin(t * 6));
      g.save();
      g.fillStyle = `rgba(0,150,255,${0.16 * s.dot})`; g.strokeStyle = `rgba(0,210,255,${0.55 * s.dot})`; g.lineWidth = 3;
      g.beginPath(); g.arc(x, y, accR, 0, Math.PI * 2); g.fill(); g.stroke();
      const col = lock > 0.5 ? '#1f8bff' : '#6aa0c8';
      g.shadowColor = lock > 0.5 ? '#00d8ff' : '#4a7a98'; g.shadowBlur = 34 * s.dot;
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 30 * pop * s.dot, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0; g.fillStyle = col; g.beginPath(); g.arc(x, y, 21 * pop * s.dot, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    // ---- ripple on lock
    if (s.ripple >= 0 && s.ripple <= 1) {
      for (let i = 0; i < 3; i++) {
        const p = clamp(s.ripple * 1.4 - i * 0.18);
        if (p <= 0 || p >= 1) continue;
        g.strokeStyle = `rgba(0,240,255,${(1 - p) * 0.9})`; g.lineWidth = 8 * (1 - p) + 2;
        g.beginPath(); g.arc(cx, cy, 30 + p * 330, 0, Math.PI * 2); g.stroke();
      }
    }

    // ---- status bar + island + home bar
    g.fillStyle = '#fff'; g.font = '800 27px Montserrat, sans-serif'; g.textBaseline = 'middle';
    g.fillText('9:41', 56, 62);
    g.fillStyle = '#000'; g.beginPath(); g.roundRect(W / 2 - 62, 36, 124, 36, 18); g.fill();
    g.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) g.fillRect(W - 168 + i * 9, 70 - (i + 1) * 6, 6, (i + 1) * 6);
    g.strokeStyle = '#fff'; g.lineWidth = 2.4; g.beginPath(); g.roundRect(W - 100, 50, 40, 20, 6); g.stroke();
    g.fillRect(W - 97, 53, 28, 14);
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.roundRect(W / 2 - 80, H - 30, 160, 7, 4); g.fill();

    // search pill (top)
    g.fillStyle = 'rgba(10,25,36,0.88)'; g.beginPath(); g.roundRect(44, 108, W - 88, 66, 33); g.fill();
    g.fillStyle = 'rgba(180,220,235,0.7)'; g.font = '600 24px Montserrat, sans-serif'; g.fillText('Pesquisar aqui', 92, 142);
    g.strokeStyle = 'rgba(0,240,255,0.7)'; g.lineWidth = 3; g.beginPath(); g.arc(68, 140, 9, 0, 7); g.moveTo(75, 147); g.lineTo(83, 155); g.stroke();

    // bottom sheet on lock
    if (s.sheet > 0.001) {
      const k = smooth(s.sheet), y = H - 250 + (1 - k) * 260;
      g.fillStyle = 'rgba(8,20,30,0.94)'; g.beginPath(); g.roundRect(26, y, W - 52, 190, 34); g.fill();
      g.strokeStyle = 'rgba(0,240,255,0.55)'; g.lineWidth = 2.5; g.beginPath(); g.roundRect(26, y, W - 52, 190, 34); g.stroke();
      g.fillStyle = '#00F0FF'; g.font = '800 22px Montserrat, sans-serif'; g.fillText('SUA LOCALIZAÇÃO', 64, y + 48);
      g.fillStyle = '#fff'; g.font = '800 36px Montserrat, sans-serif'; g.fillText('Você está aqui', 64, y + 100);
      g.fillStyle = 'rgba(160,210,225,0.85)'; g.font = '600 24px Montserrat, sans-serif'; g.fillText('Precisão: 3 m  ·  4 satélites', 64, y + 148);
    }
    g.restore();
    this.texture.needsUpdate = true;
  }
}
