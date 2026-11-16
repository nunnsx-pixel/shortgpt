import * as THREE from 'three';
import { clamp, lerp, smooth, smoother, easeOut, easeOut4, easeIn, easeOutBack, range, D2R } from './util.js';
import { U, SAT_POS, SAT_RADIUS, SAT_COLORS, CITY_ORIGIN, R_EARTH } from './world.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V3(0, 1, 0);

// ghost point: the 2nd solution of a 3-sphere intersection (mirror of the user through the plane of the 3 satellites)
const GHOST = (() => {
  const [a, b, c] = SAT_POS; const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
  const d = U.clone().sub(a).dot(n); return U.clone().addScaledVector(n, -2 * d);
})();

function cam(c, pos, tgt, fov = 40, roll = 0, near = 0.05) {
  c.CAM.pos.copy(pos); c.CAM.tgt.copy(tgt); c.CAM.fov = fov; c.CAM.roll = roll; c.CAM.near = near;
}
const orbitPos = (centre, dist, azDeg, elDeg) => {
  const az = azDeg * D2R, el = elDeg * D2R;
  return V3(centre.x + dist * Math.sin(az) * Math.cos(el), centre.y + dist * Math.sin(el), centre.z + dist * Math.cos(az) * Math.cos(el));
};
const whip = (c, t, dur = 0.3, amt = 0.16, dir = [1, 0]) => { const k = 1 - smooth(range(t, 0, dur)); if (k > 0) { c.FX.dir = dir; c.FX.dirAmt = amt * k; } };

/** place a satellite sphere: radius + "formed" weight used by the intersection glow */
function sphere(c, i, radius, o = {}) {
  const { W, T } = c;
  const form = o.formed ?? (radius >= SAT_RADIUS[i] - 0.01 ? 1 : 0);
  W.shared.uR.value[i] = radius; W.shared.uA.value[i] = form;
  W.spheres[i].set({ radius, T, ...o });
  W.spheres[i].u.uDim.value = o.dim ?? 1;
}

function showSat(c, i, { glow = 0, flash = 0, pos = null } = {}) {
  const s = c.W.sats[i]; s.visible = true; s.position.copy(pos || SAT_POS[i]);
  s.userData.glow.material.opacity = glow > 0 ? 1 : 0; s.userData.glow.scale.setScalar(Math.max(glow, 0.001));
  c.W.satFlash(s, flash); return s;
}

function paintScreen(c, o) {
  c.W.screen.paint({ t: c.T, ...o });
  c.W.sheenTex.offset.set(0.12 * Math.sin(c.T * 0.5), 0.0);
}
function floatPhone(c, { rotMul = 1, bob = 0.012, pos = U } = {}) {
  const { W, T } = c;
  W.phone.visible = true;
  W.phone.position.set(pos.x, pos.y + Math.sin(T * 1.3) * bob, pos.z);
  W.phone.rotation.set(0.04 * Math.sin(T * 0.8) * rotMul, 0.1 * Math.sin(T * 0.6) * rotMul, 0.02 * Math.sin(T * 0.9) * rotMul);
}

// ================================================================= SCENES
const SCENES = [];

// ---- 1 [00:00-00:05] O Gancho -------------------------------------------------------------
SCENES[0] = (c) => {
  const { W, FX, t, T } = c;
  floatPhone(c);
  const u = smoother(t / 5);
  cam(c, V3(U.x + lerp(0.08, -0.06, u), U.y + lerp(-0.62, 0.36, u), U.z + 2.6 - 0.15 * u), V3(U.x, U.y + lerp(-0.5, 0.26, u), U.z), 36, 0.025 * Math.sin(T * 0.7));
  W.dust.visible = true; W.bokeh.visible = true;
  // glitch + red "?" at t=2.0
  let g = 0;
  if (t >= 1.93 && t < 2.0) g = 0.35;
  else if (t >= 2.0 && t < 2.75) g = Math.pow(1 - (t - 2.0) / 0.75, 1.4);
  else if (t >= 3.3 && t < 3.38) g = 0.3;
  FX.glitch = g * 0.95;
  paintScreen(c, { glitch: g, pan: Math.sin(T * 0.5) });
  // key + shadow-casting spot (drop shadow of the "?" on the screen)
  W.spot.position.set(U.x - 0.95, U.y + 1.35, U.z + 2.5); W.spot.target.position.copy(U); W.spot.intensity = 9; W.spot.castShadow = true;
  const q = W.qMark;
  if (t >= 2.0) {
    const k = easeOutBack(range(t, 2.0, 2.5), 2.2);
    q.visible = true; q.scale.setScalar(1.0 * k); q.position.set(0, 0.2 + 0.02 * Math.sin(T * 2.1), 0.27 + 0.03 * Math.sin(T * 1.6)); q.rotation.set(0, 0.35 * Math.sin(T * 1.4), 0.05 * Math.sin(T * 1.1));
    W.qMat.emissiveIntensity = 0.55 + 0.15 * Math.sin(T * 9) + (t < 2.4 ? 1.1 : 0);
    W.fill.intensity = 1.6 * k; W.fill.position.set(U.x, U.y + 0.1, U.z + 0.9);
    W.flashSprite.visible = true; W.flashSprite.material.color.set(0xff003c); W.flashSprite.material.opacity = 0.28 * k; W.flashSprite.scale.setScalar(1.3 * k); W.flashSprite.position.set(U.x, U.y + 0.05, U.z + 0.16);
  }
  FX.dofAperture = 0; FX.bloom = 0.5;
};

// ---- 2 [00:05-00:10] O Mito do Envio ------------------------------------------------------
SCENES[1] = (c) => {
  const { W, FX, t, T } = c;
  floatPhone(c, { rotMul: 0.5 });
  W.earth.visible = true; W.earthUniforms.uTime.value = T;
  const u = smoother(t / 5);
  const centre = V3(U.x, U.y + 0.2 - 1.2 * u, U.z);
  const dist = 2.6 * Math.pow(6.4, u);
  cam(c, orbitPos(centre, dist, lerp(0, -52, u), lerp(2, 20, u)), V3(U.x, U.y + lerp(0.05, -1.7, u), U.z), lerp(36, 40, u), 0.02 * Math.sin(T * 0.6) * (1 - u), 0.05);
  const send = smooth(range(t, 0.15, 0.7));
  paintScreen(c, { send, pan: 0 });
  W.dust.visible = u < 0.5;
  // red laser out of the top of the phone, towards the satellite
  const from = V3(U.x, U.y + 0.86, U.z), to = SAT_POS[0];
  const full = from.distanceTo(to);
  const len = clamp((t - 0.55) * 16, 0, full);
  const pulse = 0.8 + 0.25 * Math.sin(T * 16);
  W.beamRed.visible = true; W.beamRed.userData.set(from, to, T, { len, amt: pulse, pulse: 1, widthMul: 1 + 0.2 * Math.sin(T * 12) });
  if (len > 0.1) {
    W.flashSprite.visible = true; W.flashSprite.material.color.set(0xff003c); W.flashSprite.material.opacity = 0.9 * pulse; W.flashSprite.scale.setScalar(0.9 + 0.2 * Math.sin(T * 14)); W.flashSprite.position.copy(from);
    W.fill.intensity = 14 * pulse; W.fill.position.copy(from).add(V3(0, 0.4, 0.3));
  }
  W.beamRed.userData.tipPos = W.beamRed.userData.tip;
  FX.dofFocus = dist; FX.dofAperture = 0; FX.bloom = 0.6;
};

// ---- 3 [00:10-00:15] O Erro Vermelho ------------------------------------------------------
SCENES[2] = (c) => {
  const { W, FX, t, T, camera } = c;
  W.earth.visible = true; W.earthUniforms.uTime.value = T;
  const s1 = SAT_POS[0];
  const from = V3(U.x, U.y + 0.86, U.z);
  const b = s1.clone().sub(from).normalize();
  const side = new THREE.Vector3().crossVectors(b, UP).normalize();
  const drift = Math.sin(T * 0.5) * 0.6;
  const campos = s1.clone().addScaledVector(side, 13 + drift).addScaledVector(b, -1.5).add(V3(0, 1.2, 0));
  cam(c, campos, s1.clone().addScaledVector(b, -2.2), 40, 0, 0.2); c.CAM.up = b.clone().applyAxisAngle(side, 0.06 * Math.sin(T * 0.8));
  // satellite + incoming laser
  const flashOn = t > 0.4;
  const sq = Math.sin(t * 52) > 0 ? 1 : 0.15;
  const flash = flashOn ? (0.35 + 0.65 * sq) * (1 - 0.35 * range(t, 2, 5)) : 0;
  const sat = showSat(c, 0, { flash });
  const full = from.distanceTo(s1);
  const tip = full - 13 * (1 - easeIn(range(t, 0, 0.42)));
  W.beamRed.visible = true; W.beamRed.userData.set(from, s1, T, { len: tip, amt: 1 + 0.25 * Math.sin(T * 18), pulse: 1, widthMul: 1.6 + 0.3 * Math.sin(T * 13) });
  if (t > 0.4) {
    W.fill.intensity = 12 * flash; W.fill.position.copy(s1).addScaledVector(side, 3).add(V3(0, 0.4, 0));
    W.flashSprite.visible = true; W.flashSprite.material.color.set(0xff003c); W.flashSprite.material.opacity = 0.45 * flash; W.flashSprite.scale.setScalar(3.2); W.flashSprite.position.copy(s1).addScaledVector(b, -0.6);
  }
  // red neon "X" around the satellite
  if (t > 0.45) {
    const k = easeOutBack(range(t, 0.45, 0.95), 2.4);
    W.redX.visible = true; W.redX.position.copy(s1).addScaledVector(side, -2.2).add(V3(0, 0.1, 0)); W.redX.lookAt(campos);
    W.redX.rotateZ(0.12 * Math.sin(T * 5)); W.redX.scale.setScalar(1.25 * k * (1 + 0.05 * Math.sin(T * 20)));
    W.redXMat.emissiveIntensity = 1.6 + 1.2 * sq;
  }
  // visual "error sound": shockwave rings
  for (let k = 0; k < 5; k++) {
    const ph = (t - 0.4) / 1.0 - k * 0.3;
    if (ph > 0 && ph < 1) W.ring(k, s1.clone().addScaledVector(b, -0.4), campos, 0.6 + ph * 5.2, 0xff003c, Math.pow(1 - ph, 1.4), 1.6);
  }
  let g = 0;
  if (t > 0.4 && t < 0.75) g = 0.9 * (1 - (t - 0.4) / 0.35); [1.7, 2.6, 3.5, 4.3].forEach((s) => { if (t > s && t < s + 0.12) g = Math.max(g, 0.5); });
  FX.glitch = g; FX.chroma = 0.0012 + 0.003 * (t > 0.4 ? sq * 0.5 : 0);
  FX.dofFocus = campos.distanceTo(s1); FX.dofAperture = 22; FX.bloom = 0.6;
  if (t > 0.38 && t < 0.5) FX.flash = 0.35 * (1 - (t - 0.38) / 0.12);
  W.dust.visible = false;
};

// ---- 4 [00:15-00:20] A Revelação da Escuta (x-ray) ----------------------------------------
SCENES[3] = (c) => {
  const { W, FX, t, T } = c;
  W.phone.visible = true; W.phone.position.copy(U);
  W.phone.rotation.set(0.03 * Math.sin(T * 0.9), Math.PI + 0.05 * Math.sin(T * 0.7), 0.01 * Math.sin(T * 1.1));
  W.phone.updateMatrixWorld(true);
  const u = smoother(range(t, 0, 5));
  const A = W.phone.localToWorld(W.antennaLocal.clone());
  // x-ray reveal: a cyan scan line sweeps the back plate away, bottom to top
  const sw = smooth(range(t, 0.3, 1.9)), y0 = lerp(U.y - 0.95, U.y + 0.95, sw);
  W.internals.visible = t > 0.25;
  W.clipBelow.constant = -y0; W.clipAbove.constant = y0;
  W.backMat.clippingPlanes = [W.clipBelow];
  W.ghostMat.opacity = 0.07 * smooth(range(t, 0.3, 1.0));
  if (t > 0.3 && t < 1.95) {
    W.scanBar.visible = true; W.scanBar.position.set(U.x, y0, U.z - 0.06 + 0.12); W.scanBar.scale.set(1, 1, 1);
  }
  W.ringsOnly = false;
  cam(c, orbitPos(V3(U.x, lerp(U.y, U.y + 0.42, u), U.z), lerp(3.6, 2.35, easeOut(range(t, 0, 4.2))), lerp(16, -20, u), lerp(8, 12, u)), V3(U.x + lerp(0, -0.05, u), lerp(U.y, U.y + 0.46, u), U.z), 40, 0.03 * Math.sin(T * 0.6), 0.03);
  W.key.intensity = 3.2; W.rim.intensity = 2.6; c.W.scene.environmentIntensity = 0.9;
  W.bumpMats.forEach((m) => { m.clippingPlanes = [W.clipBelow]; });
  // radio waves: concentric cyan rings travelling towards the antenna
  const dW = V3(0.25, 0.5, 1).normalize();
  let hit = 0;
  for (let k = 0; k < 8; k++) {
    const ph = ((t - 1.5) * 0.62 + k / 8) % 1, on = t > 1.5 ? 1 : 0;
    const s = 2.6 * (1 - ph), a = on * Math.sin(Math.PI * Math.min(1, ph * 1.05)) ** 0.8;
    W.ring(k, A.clone().addScaledVector(dW, s), A, 0.1 + 0.55 * (s / 2.6), 0x00f0ff, a * 0.9, 2.4);
    if (on && ph > 0.9) hit = Math.max(hit, (ph - 0.9) * 10);
  }
  W.antennaMat.emissiveIntensity = 2.2 + 3.5 * hit; W.gnss.material.emissiveIntensity = 0.7 + 1.8 * hit;
  W.flashSprite.visible = t > 1.5; W.flashSprite.material.color.set(0x00f0ff); W.flashSprite.material.opacity = 0.25 + 0.6 * hit; W.flashSprite.scale.setScalar(0.5 + 0.5 * hit); W.flashSprite.position.copy(A).add(V3(0, 0, 0.05));
  // callouts
  [2.5, 3.2].forEach((s, i) => { const k = easeOutBack(range(t, s, s + 0.4)); W.tags[i].visible = k > 0.01; W.tags[i].scale.set(512 / 96 * 0.085 * k, 0.085 * k, 1); W.tagLines[i].visible = k > 0.5; });
  W.dust.visible = true;
  FX.dofFocus = cam4(c).dist; FX.dofAperture = 16; FX.bloom = 0.6; FX.scan = 0.03;
};
function cam4(c) { return { dist: c.CAM.pos.distanceTo(c.CAM.tgt) }; }

// ---- 5 [00:20-00:25] O Satélite Emissor ---------------------------------------------------
SCENES[4] = (c) => {
  const { W, FX, t, T } = c;
  W.earth.visible = true; W.earthUniforms.uTime.value = T;
  const s1 = SAT_POS[0], n = s1.clone().negate().normalize();           // nadir
  const e1 = new THREE.Vector3().crossVectors(n, V3(0, 0, 1)).normalize(), e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
  const u = lerp(t / 5, smooth(t / 5), 0.45), th = 0.6 + u * Math.PI * 2;
  const pos = s1.clone().addScaledVector(e1, Math.cos(th) * 10.5).addScaledVector(e2, Math.sin(th) * 10.5).addScaledVector(n, -2.8);
  cam(c, pos, s1.clone().addScaledVector(n, 0.6), 40, 0, 0.1);
  const fireT = 1.0, pk = range(t, fireT, fireT + 0.5);
  const sat = showSat(c, 0, { glow: 3.0 * (0.5 + 0.5 * easeOut(range(t, 0.8, 1.6))), flash: 0 });
  sat.userData.feedMat.emissiveIntensity = 2.5 + 7 * Math.max(0, 1 - Math.abs(t - fireT - 0.2) * 2);
  sat.userData.glow.material.color.set(0x00f0ff);
  W.rim.intensity = 5.5; W.key.intensity = 1.8;
  // spherical energy pulse leaving the antenna towards the planet
  const r = t < fireT ? 0 : 0.5 + 5.0 * easeOut((t - fireT) / 3.5);
  sphere(c, 0, r, { opacity: 0.4, bands: 0.5, wire: 0, formed: 0, dim: 0.7 });
  if (t >= fireT && t < fireT + 0.5) W.ring(0, s1.clone().addScaledVector(n, 1.2), s1.clone().addScaledVector(n, 5), 0.3 + pk * 3, 0x00f0ff, 1 - pk, 3);
  FX.dofFocus = pos.distanceTo(s1); FX.dofAperture = 18; FX.bloom = 0.6;
  W.dust.visible = true;
  whip(c, t, 0.3, 0.11, [-1, 0.2]);
};

// ---- shared "wide" camera for the trilateration scenes ----------------------------------
const WIDE_C = V3(1.5, 17, -4);
function wideCam(c, dist, yawDeg = 0, pitchDeg = 8, shift = V3(), fov = 46) {
  const az = (6 + yawDeg) * D2R, el = pitchDeg * D2R;
  const pos = V3(WIDE_C.x + dist * Math.sin(az) * Math.cos(el), WIDE_C.y + dist * Math.sin(el), WIDE_C.z + dist * Math.cos(az) * Math.cos(el));
  cam(c, pos, WIDE_C.clone().add(shift), fov, 0, 1);
  return pos;
}
function beacon(c, k = 1, T = c.T) {
  const { W } = c;
  W.beacon.visible = k > 0; W.beaconGlow.material.opacity = k; W.beaconGlow.scale.setScalar(3.2 + 0.6 * Math.sin(T * 5));
  const ph = (T * 0.9) % 1; W.beaconRing.scale.setScalar(0.5 + ph * 2.4); W.beaconRing.material.opacity = (1 - ph) * k;
  W.beaconRing.lookAt(c.CAM.pos);
  W.beamCol.visible = true; W.beamCol.userData.set(U.clone().add(V3(0, 0.6, 0)), U.clone().add(V3(0, 7, 0)), T, { amt: 0.7 * k, pulse: 0.2, widthMul: 0.22, len: 6.4 });
}

// ---- 6 [00:25-00:30] A Primeira Esfera ----------------------------------------------------
SCENES[5] = (c) => {
  const { W, FX, t, T } = c;
  W.earth.visible = true; W.earthUniforms.uTime.value = T;
  const camPos = wideCam(c, lerp(90, 82, smooth(t / 5)), lerp(-4, 3, smooth(t / 5)), 9);
  W.phone.visible = true; W.phone.position.copy(U); W.phone.rotation.set(0, 0.2, 0); W.phone.scale.setScalar(1.0);
  paintScreen(c, { pan: 0 });
  const r0 = 5.5, r1 = SAT_RADIUS[0];
  const e = easeOut4(range(t, 0, 3.0)), r = lerp(r0, r1, e);
  const settle = smooth(range(t, 2.5, 4.0));
  sphere(c, 0, r, { opacity: lerp(0.9, 0.5, settle), bands: (1 - settle) * 0.9, wire: settle, ringAmt: 0, formed: range(t, 2.9, 3.2) });
  showSat(c, 0, { glow: 7 });
  W.sats[0].userData.feedMat.emissiveIntensity = 4;
  const hit = range(t, 2.95, 3.9);
  W.earthUniforms.uRingAmt.value = smooth(range(t, 2.9, 3.8));
  beacon(c, 1);
  if (hit > 0 && hit < 1) { W.ring(0, U, camPos, 0.5 + hit * 5, 0x2f8bff, 1 - hit, 3); W.ring(1, U, camPos, 0.3 + hit * 3, 0xffffff, (1 - hit) * 0.8, 2.5); }
  if (t > 2.9 && t < 3.15) FX.flash = 0.14 * (1 - (t - 2.9) / 0.25);
  FX.dofFocus = camPos.distanceTo(WIDE_C); FX.dofAperture = 0; FX.bloom = 0.6;
};

// ---- 7 [00:30-00:35] O Segundo e Terceiro Satélites ---------------------------------------
SCENES[6] = (c) => {
  const { W, FX, t, T } = c;
  W.earth.visible = true; W.earthUniforms.uTime.value = T;
  const pan = smooth(range(t, 0, 1.1));
  const camPos = wideCam(c, lerp(86, 80, smooth(t / 5)), lerp(26, 0, pan) + 2 * Math.sin(T * 0.4), lerp(14, 8, pan), V3(lerp(-6, 0, pan), lerp(5, 0, pan), 0));
  W.phone.visible = true; W.phone.position.copy(U); W.phone.rotation.set(0, 0.2, 0);
  paintScreen(c, { pan: 0 });
  beacon(c, 1);
  // satellites 2 & 3 swoop in, then each fires its own range sphere
  const arr = [range(t, 0.1, 1.0), range(t, 0.4, 1.3)];
  const dirIn = [V3(-1, 0.45, -0.2), V3(1, 0.5, 0.4)];
  for (let i = 1; i <= 2; i++) {
    const k = easeOut(arr[i - 1]);
    showSat(c, i, { glow: 5 * k, pos: SAT_POS[i].clone().addScaledVector(dirIn[i - 1], 26 * (1 - k)) });
  }
  showSat(c, 0, { glow: 5 });
  const fire = [1.15, 1.6];
  for (let i = 1; i <= 2; i++) {
    const k = range(t, fire[i - 1], fire[i - 1] + 1.0), form = smooth(range(t, fire[i - 1] + 0.7, fire[i - 1] + 1.6));
    sphere(c, i, SAT_RADIUS[i] * easeOut4(k), { opacity: lerp(0.9, 0.5, form), bands: (1 - form) * 0.7, wire: form, formed: k >= 1 ? 1 : 0, dim: 0.85 });
  }
  const zoneIn = smooth(range(t, 2.5, 3.4));
  sphere(c, 0, SAT_RADIUS[0], { opacity: 0.5, wire: 1, ringAmt: range(t, 2.4, 3.2), zoneAmt: zoneIn, zoneR: 6, dim: 0.85 });
  for (let i = 1; i <= 2; i++) { const u = W.spheres[i].u; u.uRingAmt.value = range(t, 2.4, 3.2); u.uZoneAmt.value = zoneIn; u.uZoneR.value = 6; u.uDim.value = 0.85; }
  // the ghost: the 2nd intersection point of three spheres
  const gk = smooth(range(t, 3.2, 3.8));
  if (gk > 0) { W.flashSprite.visible = true; W.flashSprite.material.color.set(0xff003c); W.flashSprite.material.opacity = 0.5 * gk; W.flashSprite.scale.setScalar(2.4 + 0.4 * Math.sin(T * 6)); W.flashSprite.position.copy(GHOST); }
  W.earthUniforms.uRingAmt.value = smooth(range(t, 1.6, 2.6));
  FX.dofFocus = camPos.distanceTo(WIDE_C); FX.dofAperture = 0; FX.bloom = 0.6;
  whip(c, t, 0.25, 0.13, [1, 0]);
};

// ---- 8 [00:35-00:40] O Quarto Satélite ----------------------------------------------------
SCENES[7] = (c) => {
  const { W, FX, t, T } = c;
  W.earth.visible = true; W.earthUniforms.uTime.value = T; W.earthUniforms.uCity.value = 0;
  const p = smooth(range(t, 0, 5));
  const centre = V3(U.x, lerp(15, 11.8, p), U.z);
  const camPos = orbitPos(centre, lerp(62, 22, smooth(p * 1.05)), lerp(-20, -8, p), lerp(-2, 6, p));
  cam(c, camPos, centre, 40, 0, 0.5);
  W.phone.visible = true; W.phone.position.copy(U); W.phone.rotation.set(0, 0.2, 0);
  paintScreen(c, { pan: 0 });
  beacon(c, 1 - 0.85 * smooth(range(t, 1.5, 3.0)));
  for (let i = 0; i < 3; i++) showSat(c, i, { glow: 5 });
  // sphere 4 + hero entrance of the 4th satellite
  const arr = easeOut(range(t, 0, 0.9));
  const s4 = showSat(c, 3, { glow: 11 * arr + 1.2 * Math.sin(T * 6) * arr, pos: SAT_POS[3].clone().add(V3(0, 18 * (1 - arr), 0)) });
  s4.userData.feedMat.emissiveIntensity = 6;
  W.aura.intensity = 120 * arr; W.aura.position.copy(SAT_POS[3]).add(V3(0, -1, 2));
  const k4 = range(t, 1.0, 2.0), form4 = smooth(range(t, 1.7, 2.6));
  // search-space contraction
  const shrink = smooth(range(t, 2.0, 4.5)), zr = lerp(7.5, 0.28, shrink);
  const zamt = 1;
  for (let i = 0; i < 3; i++) sphere(c, i, SAT_RADIUS[i], { opacity: 0.3, wire: 0.8, ringAmt: 1, zoneAmt: zamt, zoneR: zr, dim: 0.5 });
  sphere(c, 3, SAT_RADIUS[3] * easeOut4(k4), { opacity: lerp(1.0, 0.55, form4), bands: (1 - form4), wire: form4, ringAmt: 1, zoneAmt: zamt, zoneR: zr, formed: k4 >= 1 ? 1 : 0, dim: 0.55 });
  W.earthUniforms.uRingAmt.value = 1;
  // the ghost point is eliminated by the 4th sphere
  const gOut = range(t, 2.2, 2.7);
  if (gOut < 1) { W.flashSprite.visible = true; W.flashSprite.material.color.set(0xff003c); W.flashSprite.material.opacity = (0.5 + 0.6 * Math.sin(gOut * Math.PI)) * (1 - gOut); W.flashSprite.scale.setScalar(2.4 + 3 * gOut); W.flashSprite.position.copy(GHOST); }
  if (t > 1.0 && t < 1.2) FX.flash = 0.1;
  FX.dofFocus = camPos.distanceTo(U); FX.dofAperture = 55 * smooth(range(t, 0.2, 2.0)); FX.bloom = 0.65;
};

// ---- 9 [00:40-00:45] A Intersecção Perfeita -----------------------------------------------
SCENES[8] = (c) => {
  const { W, FX, t, T } = c;
  W.earth.visible = true; W.earthUniforms.uTime.value = T;
  // warp zoom: from far, through the atmosphere, down onto the city
  const from = U.clone().add(V3(-5.5, 8, 34)), to = U.clone().add(V3(0.7, 2.1, 4.3));
  const w = easeOut4(range(t, 0.15, 2.0)) * 0.78 + smooth(range(t, 0.15, 2.0)) * 0.22;
  const rush = Math.max(0, 1 - Math.abs(range(t, 0.15, 2.0) - 0.28) * 2.2);
  const drift = range(t, 2.0, 5.0);
  const pos = from.clone().lerp(to, w).add(V3(-0.5 * drift, 0.15 * drift, -0.6 * drift));
  cam(c, pos, U.clone().add(V3(0.3 + 0.1 * drift, 0.35, 0)), lerp(34, 46, rush) + 6 * Math.sin(T * 0.6) * 0, 0.015 * Math.sin(T * 0.7) * (t > 2 ? 1 : 0), 0.05);
  c.CAM.fov = lerp(40, 92, rush * rush) * (t < 2 ? 1 : 1) + (t >= 2 ? 0 : 0);
  if (t >= 2.0) c.CAM.fov = lerp(92 * 0 + 62, 44, smooth(range(t, 2.0, 3.0)));
  FX.radial = 0.22 * rush * rush + 0.05 * (1 - smooth(range(t, 1.7, 2.4)));
  FX.radialC = [0.5, 0.52];
  // spheres converge (tiny residual error shrinks to zero) and then fade out in the flash
  const conv = smooth(range(t, 0.2, 1.5)), vanish = 1 - smooth(range(t, 1.8, 2.5));
  for (let i = 0; i < 4; i++) {
    const err = 1 + 0.07 * (1 - conv) * Math.sin(T * 9 + i * 1.7);
    sphere(c, i, SAT_RADIUS[i] * err, { opacity: 0.4 * vanish, wire: 0.8 * vanish, ringAmt: vanish, zoneAmt: vanish, zoneR: lerp(0.28, 0.1, conv), formed: 1, dim: 0.6 });
    showSat(c, i, { glow: 5 * vanish });
  }
  W.earthUniforms.uRingAmt.value = vanish; W.earthUniforms.uCity.value = smooth(range(t, 0.8, 1.8));
  W.phone.visible = true; W.phone.position.copy(U); W.phone.rotation.set(0, 0.2, 0); W.phone.scale.setScalar(0.4);
  paintScreen(c, { dot: 1, lock: 1, pan: 0 });
  // flash at t=1.8
  const pre = smooth(range(t, 1.55, 1.85)), post = Math.exp(-Math.max(0, t - 1.85) * 2.6);
  FX.flash = t < 1.85 ? 1.3 * pre * pre : 1.3 * post;
  W.flashSprite.visible = true; W.flashSprite.material.color.set(0xffffff);
  W.flashSprite.material.opacity = t < 1.85 ? pre : post; W.flashSprite.scale.setScalar(t < 1.85 ? 0.3 + 3 * pre : 3.3 + (t - 1.85) * 1.2); W.flashSprite.position.copy(U);
  // light column + sparkling particles
  if (t >= 1.8) {
    const k = easeOut(range(t, 1.8, 2.4));
    W.beamCol.visible = true; W.beamCol.userData.set(U.clone().add(V3(0, -0.4, 0)), U.clone().add(V3(0, 40 * k, 0)), T, { amt: 0.8 * (0.9 + 0.1 * Math.sin(T * 7)), pulse: 0.3, widthMul: 0.35 });
    W.burst.visible = true; W.burst.position.copy(U); W.burst.material.uniforms.uTime.value = (t - 1.8) * 0.5; W.burst.material.uniforms.uAlpha.value = 1.6 * Math.exp(-(t - 1.8) * 0.5);
    W.sparkle.visible = true; W.sparkle.position.copy(U).add(V3(0, 1.2, 0)); W.sparkle.material.uniforms.uTime.value = T;
    W.sparkle.scale.setScalar(1.0);
  }
  // floating HUD readouts
  const texts = ['LAT: -23.55', 'LON: -46.63', 'ALT: 760m'], starts = [2.35, 2.75, 3.15];
  W.hud.forEach((h, i) => {
    const p = range(t, starts[i], starts[i] + 0.75);
    h.sprite.visible = p > 0; h.sprite.scale.set(0.98, 0.23, 1);
    h.sprite.position.copy(U).add(V3(0.95 + 0.04 * Math.sin(T * 1.3 + i), 0.92 - i * 0.3 + 0.015 * Math.sin(T * 1.7 + i), 0.45));
    h.draw('', texts[i], p, i === 2 ? '#00F0FF' : '#7fe9f2');
  });
  FX.dofFocus = pos.distanceTo(U); FX.dofAperture = t > 2 ? 14 : 0; FX.bloom = 0.7; FX.chroma = 0.0012 + 0.006 * rush;
};

// ---- 10 [00:45-00:50] Retorno à Terra -----------------------------------------------------
SCENES[9] = (c) => {
  const { W, FX, t, T } = c;
  W.city.root.visible = true; W.city.update(T);
  W.key.intensity = 0.9; W.rim.intensity = 1.0; c.W.scene.environmentIntensity = 0.22;
  const B = W.city.userPos.clone().add(CITY_ORIGIN);
  // free fall following the light column, then an instant landing
  const f = easeIn(range(t, 0, 3.0)) * 0.97 + range(t, 0, 3.0) * range(t, 0, 3.0) * 0.03;
  const land = range(t, 3.0, 3.35), settle = range(t, 3.0, 5.0);
  const y = lerp(88, 1.75, Math.min(1, Math.pow(range(t, 0, 3.0), 2.1)));
  const bounce = t >= 3.0 ? -0.18 * Math.sin(Math.PI * Math.min(1, land)) * Math.exp(-(t - 3.0) * 2) : 0;
  const lat = smooth(range(t, 1.0, 3.1));
  const px = lerp(B.x + 0.6, B.x - 4.6, lat) + 0.25 * settle, pz = lerp(B.z + 5, B.z + 9.8, lat) - 0.9 * settle;
  const pos = V3(px, y + bounce, pz);
  // looks down the light column while falling, then settles on the user
  const tgt = V3(B.x, 0, B.z - 3).lerp(V3(B.x + 0.5, 1.55, B.z - 0.6), smooth(range(t, 1.8, 3.2)));
  cam(c, pos, tgt, lerp(52, 46, smooth(range(t, 2.5, 3.3))), 0, 0.1);
  // the vertical beam and the particle cloud that the camera passes through
  W.beamUp.visible = true; W.beamUp.userData.set(B, B.clone().add(V3(0, 130, 0)), T, { amt: 0.55, pulse: 0.25, widthMul: 1 + 0.06 * Math.sin(T * 6) });
  W.cloud.visible = true; W.cloud.position.set(B.x, 34, B.z); W.cloud.material.uniforms.uTime.value = T; W.cloud.material.uniforms.uSize.value = 0.09;
  W.cloud.material.uniforms.uAlpha.value = 1.4 * (1 - smooth(range(t, 2.6, 3.2)));
  W.dust.visible = false;
  // impact ripples on the ground where the beam ends
  for (let k = 0; k < 3; k++) { const ph = ((T * 0.8) + k / 3) % 1; W.ring(k, B.clone().add(V3(0, 0.05, 0)), B.clone().add(V3(0, 5, 0)), 0.4 + ph * 3.2, 0x00f0ff, (1 - ph) * 0.8, 2.6); }
  if (t > 3.0 && t < 3.2) FX.flash = 0.25 * (1 - (t - 3.0) / 0.2);
  const fall = 1 - smooth(range(t, 2.6, 3.1));
  FX.dir = [0, 1]; FX.dirAmt = 0.1 * fall * range(t, 0, 0.6); FX.radial = 0.05 * fall; FX.radialC = [0.5, 0.45];
  FX.dofFocus = t < 3.1 ? Math.max(6, y * 0.6) : 10; FX.dofAperture = t < 3.1 ? 8 : 14; FX.bloom = 0.65; FX.chroma = 0.0018;
};

// ---- 11 [00:50-00:55] O Pin Centralizado --------------------------------------------------
SCENES[10] = (c) => {
  const { W, FX, t, T } = c;
  floatPhone(c, { rotMul: 0.6, bob: 0.008 });
  const u = smoother(t / 5);
  cam(c, V3(U.x + lerp(-0.1, 0.03, u), U.y + lerp(0.1, 0.05, u), U.z + lerp(3.3, 2.5, u)), V3(U.x, U.y + 0.02, U.z), 36, 0.01 * Math.sin(T * 0.6));
  const dot = easeOutBack(range(t, 0.7, 1.3), 2), lock = smooth(range(t, 1.3, 1.65));
  const rip = range(t, 1.6, 3.0), sheet = range(t, 2.5, 3.4);
  paintScreen(c, { dot, lock, ripple: t >= 1.6 ? rip : -1, sheet, pan: 0 });
  W.dust.visible = true; W.bokeh.visible = true;
  // 3D cyan ripples radiating from the pin
  W.screenRipples.forEach((r, i) => {
    const p = range(t, 1.62 + i * 0.22, 2.9 + i * 0.22);
    r.visible = p > 0 && p < 1; r.position.set(0, -0.04, 0.062 + 0.03 * p); r.scale.setScalar(0.06 + p * 0.95); r.material.opacity = 1 - p; r.material.color.set(0x00f0ff).multiplyScalar(2.6 * (1 - p));
  });
  const pulse = Math.max(0, 1 - Math.abs(t - 1.65) * 2.2);
  W.aura.intensity = 9 * pulse + 1.5 * sheet; W.aura.position.set(U.x, U.y - 0.05, U.z + 0.9);
  W.phoneGlow.material.opacity = 0.18 * lock + 0.5 * pulse; W.phoneGlow.scale.setScalar(3.4 + 0.6 * pulse);
  if (t > 1.58 && t < 1.8) FX.flash = 0.12 * (1 - (t - 1.58) / 0.22);
  FX.dofAperture = 0; FX.bloom = 0.6;
};

// ---- 12 [00:55-01:00] O Fechamento (CTA) --------------------------------------------------
SCENES[11] = (c) => {
  const { W, FX, t, T, camera } = c;
  W.phone.visible = true;
  W.phone.position.set(U.x, U.y + Math.sin(T * 1.1) * 0.03, U.z);
  W.phone.rotation.set(0.1 * Math.sin(T * 0.7 + 1), 0.38 * Math.sin(T * 0.9), 0.04 * Math.sin(T * 0.8));
  const u = range(t, 0, 5);
  cam(c, orbitPos(U.clone().add(V3(0, 0.05, 0)), lerp(5.6, 5.1, smooth(u)), 11 * Math.sin(T * 0.55), 5 * Math.sin(T * 0.45 + 1)), V3(U.x, U.y + 0.05, U.z), 38, 0.015 * Math.sin(T * 0.5));
  paintScreen(c, { dot: 1, lock: 1, sheet: 1, pan: 0 });
  W.dust.visible = true; W.bokeh.visible = true;
  W.phoneGlow.material.opacity = 0.2; W.phoneGlow.scale.setScalar(4);
  W.aura.intensity = 2; W.aura.position.set(U.x, U.y, U.z + 1.0);
  // orbiting UI: frosted-glass follow button and a neon heart
  W.cta.visible = true;
  const kb = easeOutBack(range(t, 0.25, 0.85)), kh = easeOutBack(range(t, 0.7, 1.3));
  const press = range(t, 3.35, 3.6), pressK = t >= 3.35 && t < 3.7 ? 1 - 0.1 * Math.sin(Math.PI * range(t, 3.35, 3.7)) : 1;
  const done = t >= 3.5;
  W.drawBtn(done, 0);
  const ob = T * 0.85 + 2.3, oh = T * 0.85 + 2.3 + Math.PI;
  const rad = 0.8;
  W.btn.position.set(U.x + Math.sin(ob) * rad * 0.9, U.y - 0.92 + 0.05 * Math.sin(T * 1.7), U.z + Math.cos(ob) * rad * 1.25 + 0.2);
  W.btn.lookAt(c.CAM.pos); W.btn.rotateY(0.18 * Math.sin(T)); W.btn.scale.setScalar(0.56 * Math.max(kb, 0.001) * pressK * (done ? 1.04 : 1));
  const beat = t >= 3.8 ? 1 + 0.2 * Math.max(0, Math.sin((t - 3.8) * 9)) * Math.exp(-(t - 3.8) * 0.9) : 1;
  W.heart.position.set(U.x + Math.sin(oh) * rad * 0.9, U.y + 0.62 + 0.06 * Math.sin(T * 1.4), U.z + Math.cos(oh) * rad * 1.25 + 0.2);
  W.heart.lookAt(c.CAM.pos); W.heart.rotateY(0.3 * Math.sin(T * 1.3)); W.heart.scale.setScalar(0.34 * Math.max(kh, 0.001) * beat * (t >= 3.8 && t < 4.0 ? 1 + 0.5 * Math.sin(Math.PI * range(t, 3.8, 4.0)) : 1));
  W.heartMat.emissiveIntensity = 1.7 + (t >= 3.8 ? 1.2 * Math.exp(-(t - 3.8)) : 0);
  W.heartGlow.position.copy(W.heart.position); W.heartGlow.material.opacity = 0.55 * kh;
  W.heartGlow.scale.setScalar(1.6 + 0.4 * Math.sin(T * 5));
  if (t >= 3.8) { W.burst.visible = true; W.burst.position.copy(W.heart.position); W.burst.material.uniforms.uTime.value = (t - 3.8) * 0.28; W.burst.material.uniforms.uSize.value = 0.012; W.burst.material.uniforms.uAlpha.value = 1.4 * Math.exp(-(t - 3.8) * 0.9); W.burst.material.uniforms.uColor.value.set(0xff6a8a); }
  FX.dofFocus = 5.1; FX.dofAperture = 8; FX.bloom = 0.6;
};

export function runScene(index, ctx) { SCENES[index](ctx); }
export { GHOST };
