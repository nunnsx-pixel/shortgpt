// Small math / easing helpers shared by every module (pure functions only:
// every frame must be a deterministic function of its frame index).
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
export const smoother = (x) => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
export const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
export const easeOut4 = (x) => 1 - Math.pow(1 - clamp(x), 4);
export const easeIn = (x) => { x = clamp(x); return x * x * x; };
export const easeInOut = smooth;
export const easeOutBack = (x, s = 1.70158) => {
  x = clamp(x); const c = s + 1;
  return 1 + c * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
};
export const range = (t, a, b) => clamp((t - a) / (b - a));
export const mix = lerp;

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hash1 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
export function noise1(x) {
  const i = Math.floor(x), f = x - i;
  return lerp(hash1(i), hash1(i + 1), f * f * (3 - 2 * f));
}
// deterministic pseudo hand-held camera shake in [-1,1]
export const shake = (T, seed = 0) => Math.sin(T * 1.7 + seed) * 0.5 + Math.sin(T * 2.9 + seed * 2.3) * 0.3 + Math.sin(T * 5.3 + seed * 0.7) * 0.2;
export const D2R = Math.PI / 180;
