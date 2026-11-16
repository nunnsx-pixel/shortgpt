import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { mulberry32, D2R, clamp } from './util.js';
import * as A from './assets.js';
import * as S from './shaders.js';

// ---------------------------------------------------------------- world constants
export const R_EARTH = 10;
export const ORBIT_R = 26;
export const U = new THREE.Vector3(0, 11.5, 0);               // the user's phone (centre) - hovers over "São Paulo"
const dirOf = (alphaDeg, azDeg) => {
  const a = alphaDeg * D2R, z = azDeg * D2R;
  return new THREE.Vector3(Math.sin(a) * Math.cos(z), Math.cos(a), Math.sin(a) * Math.sin(z));
};
// four GNSS satellites above the user's horizon (angle from zenith, azimuth)
export const SAT_POS = [
  dirOf(36, -35).multiplyScalar(ORBIT_R),
  dirOf(44, -160).multiplyScalar(ORBIT_R),
  dirOf(31, -96).multiplyScalar(ORBIT_R),
  dirOf(14, 60).multiplyScalar(ORBIT_R),
];
export const SAT_RADIUS = SAT_POS.map((p) => p.distanceTo(U));
export const SAT_COLORS = [0x2f8bff, 0x00d9a8, 0x7fcfff, 0x00f0ff];
export const CITY_ORIGIN = new THREE.Vector3(800, 0, 0);

const Y = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- helpers
function rrShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, 1.5 * Math.PI, false);
  return s;
}

function baryIcosphere(detail) {
  const g = new THREE.IcosahedronGeometry(1, detail).toNonIndexed();
  const n = g.attributes.position.count, b = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) b.set([1, 0, 0, 0, 1, 0, 0, 0, 1], i * 3);
  g.setAttribute('bary', new THREE.BufferAttribute(b, 3));
  return g;
}

function glowSprite(tex, color, size, opacity = 1) {
  const m = new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
  const s = new THREE.Sprite(m); s.scale.setScalar(size); s.userData.base = opacity; return s;
}

function makeTag(text, w = 512, h = 96, color = '#00F0FF') {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,25,35,0.7)'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 20); g.fill();
  g.strokeStyle = color; g.lineWidth = 3; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 20); g.stroke();
  g.fillStyle = '#fff'; g.font = '800 36px Montserrat, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }));
  sp.scale.set(w / h * 0.085, 0.085, 1);
  return sp;
}

// ---------------------------------------------------------------- particle fields
function makeField({ count, spread, vel = 0, size = 0.05, color = 0xffffff, alpha = 1, tw = 1, maxPx = 40, wrap = 0, shape = 'box', seed = 1, velVec = null }) {
  const rnd = mulberry32(seed);
  const pos = new Float32Array(count * 3), vv = new Float32Array(count * 3), sd = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let x, y, z;
    if (shape === 'sphere') {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.cbrt(rnd());
      const s = Math.sqrt(1 - u * u); x = s * Math.cos(th) * r; y = u * r; z = s * Math.sin(th) * r;
    } else { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1; }
    pos.set([x * spread[0], y * spread[1], z * spread[2]], i * 3);
    if (velVec) vv.set([velVec[0] * (0.5 + rnd()), velVec[1] * (0.5 + rnd()), velVec[2] * (0.5 + rnd())], i * 3);
    else vv.set([(rnd() - 0.5) * vel, (rnd() - 0.5) * vel, (rnd() - 0.5) * vel], i * 3);
    sd[i] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aVel', new THREE.BufferAttribute(vv, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uSize: { value: size }, uProj: { value: 1000 }, uWrapC: { value: new THREE.Vector3() }, uWrap: { value: wrap },
      uMaxPx: { value: maxPx }, uTw: { value: tw }, uColor: { value: new THREE.Color(color) }, uAlpha: { value: alpha },
    },
    vertexShader: S.partVert, fragmentShader: S.partFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; return pts;
}

// ---------------------------------------------------------------- signal sphere (range sphere of a satellite)
class SignalSphere {
  constructor(index, shared, geo) {
    this.index = index;
    this.u = {
      ...shared,
      uColor: { value: new THREE.Color(SAT_COLORS[index]) }, uCenter: { value: new THREE.Vector3() }, uAxis: { value: new THREE.Vector3(0, -1, 0) },
      uOpacity: { value: 1 }, uWire: { value: 0 }, uBands: { value: 0 }, uTime: { value: 0 }, uRingAmt: { value: 0 }, uZoneAmt: { value: 0 },
      uZoneR: { value: 5 }, uTarget: { value: U.clone() }, uSelf: { value: index }, uDim: { value: 1 },
    };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.u, vertexShader: S.sphereVert, fragmentShader: S.sphereFrag, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.mesh.visible = false;
  }
  set({ radius, opacity = 1, wire = 0, bands = 0, ringAmt = 0, zoneAmt = 0, zoneR = 5, T = 0, dim = 1 }) {
    this.u.uDim.value = dim;
    this.mesh.visible = radius > 0.02;
    this.mesh.position.copy(SAT_POS[this.index]);
    this.mesh.scale.setScalar(Math.max(radius, 0.001));
    this.u.uCenter.value.copy(SAT_POS[this.index]);
    this.u.uAxis.value.copy(SAT_POS[this.index]).negate().normalize();
    Object.assign(this.u.uOpacity, { value: opacity }); this.u.uWire.value = wire; this.u.uBands.value = bands;
    this.u.uRingAmt.value = ringAmt; this.u.uZoneAmt.value = zoneAmt; this.u.uZoneR.value = zoneR; this.u.uTime.value = T;
  }
}

// ---------------------------------------------------------------- beam (additive cylinder, base at origin, grows along +Y)
function makeBeam(color, radius, tipFade = 0) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true); geo.translate(0, 0.5, 0);
  const mk = (r, col, amt) => {
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(col) }, uLen: { value: 1 }, uTime: { value: 0 }, uPulse: { value: 1 }, uAmt: { value: amt }, uFade: { value: tipFade } },
      vertexShader: S.beamVert, fragmentShader: S.beamFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    m.userData.r = r; m.frustumCulled = false; g.add(m); return m;
  };
  const outer = mk(radius, color, 0.9), inner = mk(radius * 0.36, 0xffffff, 1.6);
  g.userData.set = (from, to, T, { len = null, amt = 1, pulse = 1, widthMul = 1 } = {}) => {
    const dir = to.clone().sub(from); const full = dir.length(); dir.normalize();
    const L = len == null ? full : len;
    g.position.copy(from); g.quaternion.setFromUnitVectors(Y, dir);
    [outer, inner].forEach((m) => {
      m.scale.set(m.userData.r * widthMul, Math.max(L, 0.001), m.userData.r * widthMul);
      const u = m.material.uniforms; u.uLen.value = L; u.uTime.value = T; u.uPulse.value = pulse;
    });
    outer.material.uniforms.uAmt.value = 0.9 * amt; inner.material.uniforms.uAmt.value = 1.6 * amt;
    g.visible = L > 0.01 && amt > 0.001;
    g.userData.tip = from.clone().addScaledVector(dir, L);
  };
  g.visible = false;
  return g;
}

// ================================================================= WORLD
export async function createWorld(renderer, scene, landTex) {
  const W = { scene, tex: {} };
  W.all = [];                                  // roots hidden at the start of every frame
  const reg = (o) => { W.all.push(o); scene.add(o); return o; };
  const glowTex = A.makeGlowTexture(); W.tex.glow = glowTex;

  // environment reflections (dark, subtle) -------------------------------------------------
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.32;
  scene.background = new THREE.Color(0x050505);

  // lights ---------------------------------------------------------------------------------
  W.amb = new THREE.AmbientLight(0x6a86a8, 0.18); scene.add(W.amb);
  W.key = new THREE.DirectionalLight(0xffffff, 2.2); W.key.position.set(3, 4, 6); scene.add(W.key); scene.add(W.key.target);
  W.rim = new THREE.DirectionalLight(0x00f0ff, 3.2); W.rim.position.set(-5, 2, -4); scene.add(W.rim);
  W.fill = new THREE.PointLight(0xff003c, 0, 14, 1.6); scene.add(W.fill);
  W.spot = new THREE.SpotLight(0xffffff, 0, 30, 0.5, 0.6, 1); W.spot.castShadow = false;
  W.spot.shadow.mapSize.set(1024, 1024); W.spot.shadow.bias = -0.0004; W.spot.shadow.radius = 4; scene.add(W.spot); scene.add(W.spot.target);
  W.aura = new THREE.PointLight(0x00f0ff, 0, 30, 1.4); scene.add(W.aura);

  // stars (follow the camera) --------------------------------------------------------------
  {
    const rnd = mulberry32(99), n = 2200, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, th = rnd() * 6.2832, s = Math.sqrt(1 - u * u), r = 700;
      pos.set([s * Math.cos(th) * r, u * r, s * Math.sin(th) * r], i * 3);
      const b = 0.12 + Math.pow(rnd(), 3) * 0.9, tint = rnd();
      col.set([b * (0.8 + 0.2 * tint), b * 0.92, b * (1.0)], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    W.stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 6, sizeAttenuation: false, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    W.stars.frustumCulled = false; W.stars.renderOrder = -10; scene.add(W.stars);
  }

  // shared sphere uniforms -----------------------------------------------------------------
  W.shared = {
    uC: { value: SAT_POS.map((p) => p.clone()) }, uR: { value: [0, 0, 0, 0] }, uA: { value: [0, 0, 0, 0] },
    uCol: { value: SAT_COLORS.map((c) => new THREE.Color(c)) },
  };

  // Earth ----------------------------------------------------------------------------------
  {
    W.earth = reg(new THREE.Group());
    const latSP = -23.55 * D2R, lonSP = -46.63 * D2R;
    const nSP = new THREE.Vector3(Math.cos(latSP) * Math.sin(lonSP), Math.sin(latSP), Math.cos(latSP) * Math.cos(lonSP));
    W.earthUniforms = {
      uLand: { value: landTex }, uLightDir: { value: new THREE.Vector3(0.55, 0.45, 0.8).normalize() }, uUser: { value: U.clone() },
      uRingAmt: { value: 0 }, uCity: { value: 0 }, uTime: { value: 0 }, ...W.shared,
    };
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH, 160, 112), new THREE.ShaderMaterial({ uniforms: W.earthUniforms, vertexShader: S.earthVert, fragmentShader: S.earthFrag }));
    const q0 = new THREE.Quaternion().setFromUnitVectors(nSP, Y);
    const twist = new THREE.Quaternion().setFromAxisAngle(Y, 150 * D2R);
    mesh.quaternion.copy(twist.multiply(q0));
    W.earthMesh = mesh; W.earth.add(mesh);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH * 1.035, 96, 64), new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0.1, 0.55, 1.0) }, uAmt: { value: 1.0 } }, vertexShader: S.atmoVert, fragmentShader: S.atmoFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    W.atmo = atmo; W.earth.add(atmo);
    // locator beacon on the user's position (visible in the wide shots)
    W.beacon = reg(new THREE.Group());
    W.beaconGlow = glowSprite(glowTex, 0x00f0ff, 2.6, 1); W.beacon.add(W.beaconGlow);
    W.beaconRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 2.2, 2.6), transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    W.beacon.add(W.beaconRing); W.beacon.position.copy(U);
  }

  // Phone ----------------------------------------------------------------------------------
  const PW = 0.8, PH = 1.7, PD = 0.09;
  W.PW = PW; W.PH = PH; W.PD = PD;
  W.screen = new A.MapScreen();
  {
    const phone = reg(new THREE.Group()); W.phone = phone;
    const metal = new THREE.MeshStandardMaterial({ color: 0x1a1d23, metalness: 0.92, roughness: 0.3 });
    // frame
    const outer = rrShape(PW, PH, 0.115); outer.holes.push(rrShape(PW - 0.028, PH - 0.028, 0.1));
    const fg = new THREE.ExtrudeGeometry(outer, { depth: PD - 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 2, curveSegments: 14 });
    fg.translate(0, 0, -(PD - 0.012) / 2);
    const frame = new THREE.Mesh(fg, metal); phone.add(frame);
    // back plate (clip-able for the x-ray reveal)
    W.clipBelow = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);        // keeps y >= y0
    W.clipAbove = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);       // keeps y <= y0
    const bg = new THREE.ShapeGeometry(rrShape(PW - 0.022, PH - 0.022, 0.104), 20);
    W.backMat = new THREE.MeshStandardMaterial({ color: 0x0c0f14, metalness: 0.55, roughness: 0.16, side: THREE.FrontSide, clippingPlanes: [W.clipBelow] });
    const back = new THREE.Mesh(bg, W.backMat); back.rotation.y = Math.PI; back.position.z = -PD / 2 + 0.0075; phone.add(back);
    W.ghostMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.0, 0.5, 0.65), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, clippingPlanes: [W.clipAbove], side: THREE.DoubleSide });
    const ghost = new THREE.Mesh(bg, W.ghostMat); ghost.rotation.y = Math.PI; ghost.position.z = -PD / 2 + 0.0065; phone.add(ghost);
    // screen
    W.screenMat = new THREE.MeshBasicMaterial({ map: W.screen.texture, color: new THREE.Color(1.18, 1.18, 1.18), alphaTest: 0.5, transparent: false });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.77, 1.67), W.screenMat); scr.position.z = PD / 2 - 0.0045; phone.add(scr); W.screenMesh = scr;
    // glass sheen (additive diagonal highlight)
    {
      const c = document.createElement('canvas'); c.width = 256; c.height = 512; const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 256, 512); gr.addColorStop(0.35, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.62, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 512);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; W.sheenTex = t;
      const sheen = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.65), new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.28 }));
      sheen.position.z = PD / 2 - 0.0035; phone.add(sheen); W.sheen = sheen;
    }
    // shadow catcher over the screen (for the 3D "?" drop shadow)
    W.shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(0.77, 1.67), new THREE.ShadowMaterial({ opacity: 0.9, color: 0x000000 }));
    W.shadowCatcher.position.z = PD / 2 - 0.003; W.shadowCatcher.receiveShadow = true; phone.add(W.shadowCatcher);
    // camera bump + lenses on the back
    {
      const bump = new THREE.Group(); bump.position.set(-0.17, 0.6, -PD / 2 - 0.004); bump.rotation.y = Math.PI; phone.add(bump);
      W.bumpMats = [];
      const bm0 = new THREE.MeshStandardMaterial({ color: 0x07090c, metalness: 0.4, roughness: 0.1 }); W.bumpMats.push(bm0);
      bump.add(new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.34, 0.016, 3, 0.05), bm0));
      [[-0.07, 0.07], [-0.07, -0.07], [0.07, 0]].forEach(([x, y]) => {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.062, 0.02, 32), (W.bumpMats.push(metal.clone()), W.bumpMats[W.bumpMats.length - 1])); ring.rotation.x = Math.PI / 2; ring.position.set(x, y, 0.016); bump.add(ring);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.044, 32), (W.bumpMats.push(new THREE.MeshStandardMaterial({ color: 0x0a1426, metalness: 1, roughness: 0.05, emissive: 0x06306a, emissiveIntensity: 0.5 })), W.bumpMats[W.bumpMats.length - 1])); lens.position.set(x, y, 0.0275); bump.add(lens);
      });
    }
    // side buttons
    [[PW / 2 + 0.002, 0.35, 0.16], [-PW / 2 - 0.002, 0.42, 0.1], [-PW / 2 - 0.002, 0.24, 0.1]].forEach(([x, y, h]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.012, h, 0.03), metal); b.position.set(x, y, 0); phone.add(b); });

    // ---- internals (x-ray) -----------------------------------------------------------
    const I = new THREE.Group(); I.position.z = 0; phone.add(I); W.internals = I;
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.55 });
    const addBox = (w, h, d, x, y, z, mat, edges = true) => {
      const geo = new THREE.BoxGeometry(w, h, d); const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); I.add(m);
      if (edges) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat); e.position.copy(m.position); I.add(e); }
      return m;
    };
    const pcbTex = A.makePcbTexture();
    addBox(0.7, 1.18, 0.012, 0, 0.24, 0.002, new THREE.MeshStandardMaterial({ color: 0xffffff, map: pcbTex, emissiveMap: pcbTex, emissive: 0xffffff, emissiveIntensity: 0.22, metalness: 0.35, roughness: 0.55 }));
    addBox(0.66, 0.5, 0.034, 0, -0.55, -0.012, new THREE.MeshStandardMaterial({ color: 0x151b22, metalness: 0.8, roughness: 0.35, emissive: 0x00303a, emissiveIntensity: 0.6 }));          // battery
    const chipMat = new THREE.MeshStandardMaterial({ color: 0xaab6c4, metalness: 1, roughness: 0.22 });
    const chipMat2 = new THREE.MeshStandardMaterial({ color: 0x6b7683, metalness: 1, roughness: 0.3 });
    const soc = addBox(0.24, 0.24, 0.026, -0.1, 0.36, -0.017, chipMat);
    addBox(0.15, 0.15, 0.006, -0.1, 0.36, -0.033, new THREE.MeshStandardMaterial({ color: 0xd8e2ee, metalness: 1, roughness: 0.12, emissive: 0x0a2a33, emissiveIntensity: 0.6 }), false);
    addBox(0.2, 0.15, 0.02, -0.17, 0.08, -0.014, chipMat2);                    // memory
    addBox(0.16, 0.16, 0.02, 0.17, 0.12, -0.014, chipMat2);                      // modem
    addBox(0.1, 0.08, 0.016, 0.2, -0.1, -0.012, chipMat2);                      // PMIC
    // the GNSS chip + patch antenna (what receives the satellite signals)
    W.gnss = addBox(0.14, 0.14, 0.022, 0.19, 0.42, -0.015, new THREE.MeshStandardMaterial({ color: 0x9fd9e6, metalness: 1, roughness: 0.18, emissive: 0x00f0ff, emissiveIntensity: 0.7 }));
    W.antennaLocal = new THREE.Vector3(0.0, 0.79, -0.014);
    W.antennaMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 2.2, metalness: 0.3, roughness: 0.4 });
    {
      const pts = []; const x0 = -0.3, x1 = 0.3; let x = x0; pts.push(new THREE.Vector3(x, 0.74, -0.007));
      for (let i = 0; i < 9; i++) { x += (x1 - x0) / 9; pts.push(new THREE.Vector3(x, i % 2 ? 0.74 : 0.82, -0.007)); }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.02), 120, 0.0065, 6, false), W.antennaMat);
      I.add(tube);
      const patch = addBox(0.15, 0.1, 0.016, 0.0, 0.79, -0.012, new THREE.MeshStandardMaterial({ color: 0xc9a24b, metalness: 1, roughness: 0.25, emissive: 0x4a3a10, emissiveIntensity: 0.6 }));
      W.antennaPatch = patch;
    }
    // pins around SoC
    {
      const pg = new THREE.BoxGeometry(0.012, 0.012, 0.004), pm = new THREE.MeshStandardMaterial({ color: 0xd4af5a, metalness: 1, roughness: 0.3 });
      const im = new THREE.InstancedMesh(pg, pm, 56); const m4 = new THREE.Matrix4(); let k = 0;
      for (let i = 0; i < 14; i++) { const o = -0.115 + i * (0.23 / 13);
        m4.makeTranslation(-0.1 + o, 0.36 + 0.13, -0.0075); im.setMatrixAt(k++, m4); m4.makeTranslation(-0.1 + o, 0.36 - 0.13, -0.0075); im.setMatrixAt(k++, m4);
        m4.makeTranslation(-0.1 + 0.13, 0.36 + o, -0.0075); im.setMatrixAt(k++, m4); m4.makeTranslation(-0.1 - 0.13, 0.36 + o, -0.0075); im.setMatrixAt(k++, m4); }
      I.add(im);
    }
    // camera module (inside)
    { const cm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 24), chipMat2); cm.rotation.x = Math.PI / 2; cm.position.set(-0.17, 0.62, -0.02); I.add(cm); }
    W.tags = [];
    const t1 = makeTag('ANTENA GNSS'); t1.position.set(0.0, 1.0, -0.12); I.add(t1);
    const t2 = makeTag('CHIP RECEPTOR'); t2.position.set(0.12, 0.2, -0.12); I.add(t2);
    W.tags.push(t1, t2);
    const mkLine = (a, b) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.8 })); I.add(l); return l; };
    W.tagLines = [mkLine(new THREE.Vector3(0.0, 0.96, -0.12), new THREE.Vector3(0.0, 0.8, -0.03)), mkLine(new THREE.Vector3(0.18, 0.235, -0.12), new THREE.Vector3(0.19, 0.4, -0.03))];
    I.visible = false;

    // ---- 3D "?" and "X" (scenes 1 and 3) -----------------------------------------------
    const font = new FontLoader().parse(await (await fetch('./node_modules/three/examples/fonts/helvetiker_bold.typeface.json')).json());
    const qg = new TextGeometry('?', { font, size: 0.5, depth: 0.12, curveSegments: 12, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.012, bevelSegments: 4 });
    qg.center();
    W.qMat = new THREE.MeshStandardMaterial({ color: 0xff003c, emissive: 0xff003c, emissiveIntensity: 2.4, metalness: 0.25, roughness: 0.3 });
    W.qMark = new THREE.Mesh(qg, W.qMat); W.qMark.castShadow = true; W.qMark.visible = false; phone.add(W.qMark);

    // 3D ripple rings on the phone (scene 11)
    W.screenRipples = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 2.4, 2.8), transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      r.visible = false; phone.add(r); W.screenRipples.push(r);
    }
    W.phoneGlow = glowSprite(glowTex, 0x00f0ff, 3.4, 0); W.phoneGlow.position.z = -0.1; phone.add(W.phoneGlow);
  }
  W.scanBar = reg(new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.035), new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 3.2, 4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
  W.redX = reg(new THREE.Group());
  {
    const m = new THREE.MeshStandardMaterial({ color: 0xff003c, emissive: 0xff003c, emissiveIntensity: 3, metalness: 0.3, roughness: 0.3 });
    for (const s of [1, -1]) { const b = new THREE.Mesh(new RoundedBoxGeometry(3.6, 0.32, 0.32, 3, 0.1), m); b.rotation.z = s * Math.PI / 4; W.redX.add(b); }
    W.redXMat = m;
  }

  // Satellites -------------------------------------------------------------------------------
  const solarTex = A.makeSolarTexture();
  function makeSatellite() {
    const sat = new THREE.Group(); const hot = [];
    const busMat = new THREE.MeshStandardMaterial({ color: 0x343a44, metalness: 0.85, roughness: 0.38, emissive: 0xff0020, emissiveIntensity: 0 });
    const foilMat = new THREE.MeshStandardMaterial({ color: 0xc79a3a, metalness: 1, roughness: 0.26, emissive: 0xff0020, emissiveIntensity: 0 });
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xbfc8d4, metalness: 1, roughness: 0.25, emissive: 0xff0020, emissiveIntensity: 0 });
    hot.push(busMat, foilMat, lightMat);
    const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); sat.add(m); return m; };
    add(new THREE.BoxGeometry(1.0, 0.9, 1.3), busMat);
    add(new THREE.BoxGeometry(1.05, 0.52, 0.72), foilMat, 0, 0, -0.28);
    add(new THREE.BoxGeometry(0.52, 0.94, 0.4), foilMat, 0, 0, 0.42);
    // solar wings
    const panelMats = [lightMat, lightMat, new THREE.MeshStandardMaterial({ map: solarTex, metalness: 0.7, roughness: 0.2 }), new THREE.MeshStandardMaterial({ map: solarTex, metalness: 0.7, roughness: 0.2 }), lightMat, lightMat];
    for (const s of [1, -1]) {
      const yoke = add(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 12), lightMat, s * 0.7, 0, 0); yoke.rotation.z = Math.PI / 2;
      for (let i = 0; i < 2; i++) { const p = add(new THREE.BoxGeometry(0.9, 0.024, 1.15), panelMats, s * (1.15 + i * 0.95), 0, 0); p.name = 'panel'; }
      add(new THREE.CylinderGeometry(0.02, 0.02, 1.9, 8), lightMat, s * 1.6, 0.02, 0).rotation.z = Math.PI / 2;
    }
    // nadir antenna dish + feed (the "mouth" that sends the signal down)
    const dish = add(new THREE.SphereGeometry(0.46, 40, 14, 0, Math.PI * 2, 0, 0.95), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.9, roughness: 0.22, side: THREE.DoubleSide }), 0, 0, 1.05);
    dish.rotation.x = -Math.PI / 2;                       // pole towards the bus, concave side faces +Z (nadir)
    const mast = add(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), lightMat, 0, 0, 0.82); mast.rotation.x = Math.PI / 2;
    sat.userData.feedMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 2.5 });
    add(new THREE.SphereGeometry(0.075, 16, 12), sat.userData.feedMat, 0, 0, 1.05);
    // small details: whip antennas, thrusters, star tracker, status LED
    for (const s of [1, -1]) add(new THREE.CylinderGeometry(0.008, 0.012, 0.9, 6), lightMat, s * 0.3, 0.85, -0.3);
    for (const [x, y] of [[0.25, 0.2], [-0.25, 0.2], [0.25, -0.2], [-0.25, -0.2]]) { const t = add(new THREE.CylinderGeometry(0.05, 0.08, 0.16, 12), busMat, x, y, -0.72); t.rotation.x = Math.PI / 2; }
    add(new THREE.BoxGeometry(0.2, 0.14, 0.2), busMat, 0.34, -0.5, -0.1);
    sat.userData.led = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 3 });
    add(new THREE.SphereGeometry(0.035, 10, 8), sat.userData.led, -0.4, 0.46, 0.5);
    sat.userData.hot = hot;
    sat.userData.glow = glowSprite(glowTex, 0x00f0ff, 0, 0); sat.userData.glow.position.z = 1.05; sat.add(sat.userData.glow);
    return sat;
  }
  W.sats = SAT_POS.map((p, i) => { const s = reg(makeSatellite()); s.position.copy(p); s.lookAt(0, 0, 0); s.userData.restQ = s.quaternion.clone(); s.userData.glow.material.color.set(SAT_COLORS[i]); return s; });
  W.satFlash = (sat, amt) => { sat.userData.hot.forEach((m) => { m.emissiveIntensity = amt * 2.4; }); };

  // Signal spheres + beams -------------------------------------------------------------------
  const sGeo = baryIcosphere(5);
  W.spheres = SAT_POS.map((_, i) => { const sp = new SignalSphere(i, W.shared, sGeo); scene.add(sp.mesh); W.all.push(sp.mesh); return sp; });
  W.beamRed = reg(makeBeam(0xff003c, 0.08));
  W.beamCol = reg(makeBeam(0x00f0ff, 0.5, 1));        // light column at the intersection
  W.beamUp = reg(makeBeam(0x00f0ff, 0.42, 0));         // city light column
  W.sparkle = reg(makeField({ count: 500, spread: [4, 4, 4], vel: 0, size: 0.03, color: 0xbff8ff, alpha: 1.4, tw: 1, maxPx: 22, shape: 'sphere', seed: 5 }));

  // pooled rings (shockwaves / ripples / radio waves)
  W.ringPool = [];
  const ringGeos = [new THREE.RingGeometry(0.96, 1, 128), new THREE.RingGeometry(0.88, 1, 128)];
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(ringGeos[i % 2], new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.visible = false; reg(m); W.ringPool.push(m);
  }
  W.ring = (i, pos, lookAtPos, radius, color, alpha, bright = 2.2) => {
    const m = W.ringPool[i]; m.visible = alpha > 0.003 && radius > 0.001;
    m.position.copy(pos); if (lookAtPos) m.lookAt(lookAtPos); m.scale.setScalar(radius);
    m.material.color.set(color).multiplyScalar(bright * alpha);
  };
  // 3D disks used for the first expanding pulse flash
  W.flashSprite = reg(glowSprite(glowTex, 0xffffff, 1, 0));

  // global drifting dust
  W.dust = reg(makeField({ count: 520, spread: [1, 1, 1], vel: 0.12, size: 0.012, color: 0x9fdcff, alpha: 0.7, tw: 1, maxPx: 8, wrap: 16, seed: 3 }));
  W.burst = reg(makeField({ count: 900, spread: [0.1, 0.1, 0.1], vel: 7, size: 0.018, color: 0xdffcff, alpha: 1.6, tw: 1, maxPx: 22, shape: 'sphere', seed: 8 }));
  W.cloud = reg(makeField({ count: 1400, spread: [14, 16, 14], vel: 0, size: 0.05, color: 0xbff8ff, alpha: 1.5, tw: 1, maxPx: 60, shape: 'box', seed: 21, velVec: [0, 0.35, 0] }));
  W.bokeh = reg(makeField({ count: 90, spread: [4, 4, 3], vel: 0.15, size: 0.07, color: 0x00f0ff, alpha: 0.5, tw: 1, maxPx: 70, wrap: 8, seed: 33 }));

  // HUD labels (scene 9)
  W.hud = [new A.HudLabel(), new A.HudLabel(), new A.HudLabel()].map((h) => { reg(h.sprite); return h; });

  // CTA graphics (scene 12) ----------------------------------------------------------------
  {
    W.cta = reg(new THREE.Group());
    // frosted-glass "Seguir" button
    const btn = new THREE.Group(); W.btn = btn;
    const glass = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.42, 0.07, 4, 0.2), new THREE.MeshPhysicalMaterial({ color: 0xcfeff5, transparent: true, opacity: 0.2, roughness: 0.35, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.2, envMapIntensity: 1.6 }));
    btn.add(glass);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.012, 8, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 2, 2.4) })); edge.visible = false;
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new RoundedBoxGeometry(1.2, 0.42, 0.07, 4, 0.2), 30), new THREE.LineBasicMaterial({ color: 0x7ff6ff, transparent: true, opacity: 0.8 })); btn.add(outline);
    W.btnCanvas = document.createElement('canvas'); W.btnCanvas.width = 512; W.btnCanvas.height = 180; W.btnTex = new THREE.CanvasTexture(W.btnCanvas); W.btnTex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.386), new THREE.MeshBasicMaterial({ map: W.btnTex, transparent: true, depthWrite: false })); label.position.z = 0.04; btn.add(label);
    W.btnState = '';
    W.drawBtn = (done, press) => {
      const key = `${done}|${press.toFixed(2)}`; if (W.btnState === key) return; W.btnState = key;
      const g = W.btnCanvas.getContext('2d'); g.clearRect(0, 0, 512, 180);
      g.fillStyle = done ? 'rgba(0,240,255,0.26)' : 'rgba(255,255,255,0.12)'; g.beginPath(); g.roundRect(8, 8, 496, 164, 82); g.fill();
      g.fillStyle = '#fff'; g.font = '800 70px Montserrat, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(done ? 'Seguindo ✓' : '+ Seguir', 256, 94);
      W.btnTex.needsUpdate = true;
    };
    W.cta.add(btn);
    // heart
    const hs = new THREE.Shape(); hs.moveTo(0, -0.5); hs.bezierCurveTo(-0.15, -0.38, -0.6, -0.12, -0.6, 0.18); hs.bezierCurveTo(-0.6, 0.45, -0.3, 0.55, 0, 0.3); hs.bezierCurveTo(0.3, 0.55, 0.6, 0.45, 0.6, 0.18); hs.bezierCurveTo(0.6, -0.12, 0.15, -0.38, 0, -0.5);
    const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 5, curveSegments: 24 }); hg.center();
    W.heartMat = new THREE.MeshStandardMaterial({ color: 0xff003c, emissive: 0xff003c, emissiveIntensity: 1.7, metalness: 0.2, roughness: 0.28 });
    W.heart = new THREE.Mesh(hg, W.heartMat); W.heart.scale.setScalar(0.4); W.cta.add(W.heart);
    // a second, smaller glass chip: "like" count bubble
    W.heartGlow = glowSprite(glowTex, 0xff003c, 1.6, 0.6); W.cta.add(W.heartGlow);
  }

  // City (scene 10) ------------------------------------------------------------------------
  W.city = buildCity(reg, glowTex);

  W.reset = () => {
    W.all.forEach((o) => { o.visible = false; });
    W.earth.visible = false;
    W.spheres.forEach((s) => { s.mesh.visible = false; });
    W.shared.uR.value.fill(0); W.shared.uA.value.fill(0);
    W.qMark.visible = false; W.internals.visible = false; W.screenRipples.forEach((r) => { r.visible = false; });
    W.tags.forEach((t) => { t.visible = false; }); W.tagLines.forEach((l) => { l.visible = false; });
    W.backMat.clippingPlanes = []; W.bumpMats.forEach((m) => { m.clippingPlanes = []; }); W.ghostMat.opacity = 0; W.phoneGlow.material.opacity = 0;
    W.spot.castShadow = false; W.spot.intensity = 0; W.fill.intensity = 0; W.aura.intensity = 0;
    W.key.intensity = 2.2; W.rim.intensity = 3.2; W.amb.intensity = 0.18; scene.environmentIntensity = 0.32;
    W.earthUniforms.uRingAmt.value = 0; W.earthUniforms.uCity.value = 0;
    W.sats.forEach((s) => { W.satFlash(s, 0); s.userData.glow.material.opacity = 0; s.quaternion.copy(s.userData.restQ); s.userData.feedMat.emissiveIntensity = 2.5; });
    W.phone.scale.setScalar(1); W.phone.rotation.set(0, 0, 0); W.phone.position.copy(U);
    W.redX.visible = false; W.cta.visible = false; W.hud.forEach((h) => { h.sprite.visible = false; });
    W.city.root.visible = false; W.stars.visible = true;
    W.fields = [W.sparkle, W.dust, W.burst, W.cloud, W.bokeh];
    W.fields.forEach((f) => { f.position.set(0, 0, 0); f.scale.setScalar(1); });
    const bu = W.burst.material.uniforms; bu.uSize.value = 0.018; bu.uColor.value.set(0xdffcff); bu.uAlpha.value = 1.6; bu.uTime.value = 0;
    const cu = W.cloud.material.uniforms; cu.uSize.value = 0.05; cu.uAlpha.value = 1.5;
    W.sparkle.material.uniforms.uTime.value = 0;
    W.flashSprite.scale.setScalar(1); W.flashSprite.material.opacity = 0; W.flashSprite.position.set(0, 0, 0);
    W.sats.forEach((s) => { s.userData.glow.scale.setScalar(0.001); });
    W.antennaMat.emissiveIntensity = 2.2; W.gnss.material.emissiveIntensity = 0.7;
    W.drawBtn(false, 0);
    W.beacon.visible = false; W.scanBar.visible = false;
    W.sheenTex.offset.set(0, 0);
    W.beamRed.userData.set(U, U.clone().add(new THREE.Vector3(0, 1, 0)), 0, { len: 0 }); W.beamCol.userData.set(U, U.clone().add(new THREE.Vector3(0, 1, 0)), 0, { len: 0 }); W.beamUp.userData.set(U, U.clone().add(new THREE.Vector3(0, 1, 0)), 0, { len: 0 });
    W.beamRed.visible = W.beamCol.visible = W.beamUp.visible = false;
    W.ringPool.forEach((r) => { r.visible = false; });
  };
  return W;
}

// ================================================================= CITY (scene 10)
function buildCity(reg, glowTex) {
  const root = reg(new THREE.Group()); root.position.copy(CITY_ORIGIN);
  const C = { root, cars: [], bokeh: null };
  const rnd = mulberry32(777);
  const winTex = A.makeWindowTexture(3);
  const mat = (o) => new THREE.MeshStandardMaterial(o);
  // ground + road + sidewalks
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 700), mat({ color: 0x06080b, roughness: 0.55, metalness: 0.45 })); ground.rotation.x = -Math.PI / 2; ground.position.z = -180; root.add(ground);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 700), mat({ color: 0x0c0f14, roughness: 0.28, metalness: 0.7 })); road.rotation.x = -Math.PI / 2; road.position.set(0, 0.01, -180); root.add(road);
  for (const s of [-1, 1]) { const sw = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.2, 700), mat({ color: 0x171c24, roughness: 0.6, metalness: 0.3 })); sw.position.set(s * 6.2, 0.1, -180); root.add(sw); }
  // lane dashes + crosswalk
  const dashGeo = new THREE.BoxGeometry(0.16, 0.012, 2.2), dashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.82, 0.95) });
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, 90); const m4 = new THREE.Matrix4();
  for (let i = 0; i < 90; i++) { m4.makeTranslation(0, 0.02, 30 - i * 4.4); dashes.setMatrixAt(i, m4); } root.add(dashes);
  const zebra = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.012, 3.2), dashMat, 12);
  for (let i = 0; i < 12; i++) { m4.makeTranslation(-3.85 + i * 0.7, 0.02, -14); zebra.setMatrixAt(i, m4); } root.add(zebra);
  // buildings
  for (const side of [-1, 1]) {
    let z = 34;
    while (z > -260) {
      const w = 9 + rnd() * 8, d = 11 + rnd() * 8, h = 16 + Math.pow(rnd(), 1.6) * 62;
      const geo = new THREE.BoxGeometry(w, h, d); const uv = geo.attributes.uv;
      for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        if (f === 2 || f === 3) { uv.setXY(i, 0, 0); continue; }
        const span = f < 2 ? d : w; uv.setXY(i, uv.getX(i) * span / 6.5, uv.getY(i) * h / 7.5);
      }
      const b = new THREE.Mesh(geo, mat({ color: 0x10151c, roughness: 0.65, metalness: 0.35, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: 1.35 }));
      b.position.set(side * (7.9 + w / 2), h / 2, z - d / 2); root.add(b);
      // roof sign strip (neon accent)
      if (rnd() < 0.5) { const s = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.35, 0.2), new THREE.MeshBasicMaterial({ color: rnd() < 0.7 ? new THREE.Color(0, 1.8, 2.2) : new THREE.Color(2.2, 0.0, 0.4) })); s.position.set(side * (7.9 - 0.12), 5 + rnd() * 6, z - d / 2); root.add(s); }
      z -= d + 0.8 + rnd() * 2.4;
    }
  }
  // lamp posts
  const poleMat = mat({ color: 0x1a1f26, metalness: 0.8, roughness: 0.4 });
  for (const side of [-1, 1]) for (let i = 0; i < 16; i++) {
    const z = 20 - i * 15 - (side > 0 ? 6 : 0);
    if (side > 0 && Math.abs(z) < 16) continue;            // keep the user's stretch of pavement clear
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 6.2, 8), poleMat); p.position.set(side * 5.0, 3.1, z); root.add(p);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.1), poleMat); arm.position.set(side * 4.35, 6.15, z); root.add(arm);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.25), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.55, 1.15) })); lamp.position.set(side * 3.7, 6.08, z); root.add(lamp);
    const gl = glowSprite(glowTex, 0xffd9a0, 2.2, 0.38); gl.position.set(side * 3.7, 6.0, z); gl.userData.lamp = true; root.add(gl);
  }
  // traffic light (red = palette accent)
  { const tp = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.8, 8), poleMat); tp.position.set(-4.8, 2.4, -12); root.add(tp);
    const hd = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.35), mat({ color: 0x0a0c10 })); hd.position.set(-4.8, 5.0, -12); root.add(hd);
    const rl = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.1, 0.25) })); rl.position.set(-4.8, 5.3, -11.8); root.add(rl); }
  // cars
  const colors = [0x1b2230, 0x2a1218, 0x7d8692, 0x10161f, 0x0e3a4a, 0x2c2f36];
  for (let i = 0; i < 44; i++) {
    const car = new THREE.Group(); const cm = mat({ color: colors[i % colors.length], metalness: 0.85, roughness: 0.28 });
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.85, 0.62, 4.3, 2, 0.12), cm); body.position.y = 0.55; car.add(body);
    const cab = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.5, 2.1, 2, 0.14), mat({ color: 0x06090d, metalness: 0.9, roughness: 0.1 })); cab.position.set(0, 1.02, -0.2); car.add(cab);
    const dir = i % 2 ? 1 : -1;        // +1 drives towards the camera (+z)
    const fz = dir > 0 ? 2.16 : -2.16;
    const head = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.2, 2.9) }), tail = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 0.05, 0.2) });
    for (const sx of [-0.62, 0.62]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.05), head); hl.position.set(sx, 0.6, fz); car.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.05), tail); tl.position.set(sx, 0.64, -fz); car.add(tl);
    }
    const pool = glowSprite(glowTex, 0xdff6ff, 2.2, 0.35); pool.position.set(0, 0.4, fz * 1.05); car.add(pool);
    const tpool = glowSprite(glowTex, 0xff1040, 1.8, 0.4); tpool.position.set(0, 0.5, -fz * 1.05); car.add(tpool);
    const lane = dir > 0 ? ((i >> 1) % 2 ? -1.3 : -3.2) : ((i >> 1) % 2 ? 1.3 : 3.2);
    car.userData = { dir, x: lane, z0: rnd() * 280, speed: 8 + rnd() * 6 }; root.add(car); C.cars.push(car);
  }
  // pedestrians
  C.peds = [];
  for (let i = 0; i < 9; i++) {
    const p = new THREE.Group(); const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.7, 4, 8), mat({ color: i % 3 === 0 ? 0x2a3140 : 0x1a1f28, roughness: 0.6, metalness: 0.2 })); body.position.y = 0.85; p.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), mat({ color: 0x3a3f4a })); head.position.y = 1.5; p.add(head);
    const side = i % 2 ? 1 : -1; p.userData = { x: side * (5.5 + (i % 3) * 0.7), z0: rnd() * 60, dir: rnd() < 0.5 ? 1 : -1, speed: 0.9 + rnd() * 0.5 }; root.add(p); C.peds.push(p);
  }
  // the user (centre of the beam), on the right sidewalk
  const user = new THREE.Group(); C.userPos = new THREE.Vector3(5.4, 0, 0); user.position.copy(C.userPos);
  { const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 0.72, 4, 10), mat({ color: 0x232a36, roughness: 0.5, metalness: 0.3, emissive: 0x003a44, emissiveIntensity: 0.9 })); body.position.y = 0.9; user.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), mat({ color: 0x3c4452, emissive: 0x003a44, emissiveIntensity: 0.6 })); head.position.y = 1.62; user.add(head);
    const ph = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.26, 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 2.4, 2.8) })); ph.position.set(0.12, 1.05, 0.25); ph.rotation.x = -0.4; user.add(ph); }
  root.add(user); C.user = user;
  C.beamBase = C.userPos.clone().add(CITY_ORIGIN);
  C.update = (T) => {
    const L = 280;
    C.cars.forEach((c) => {
      const u = c.userData, k = (((u.z0 + u.dir * u.speed * T) % L) + L) % L;
      c.position.set(u.x, 0, 40 - k);
    });
    C.peds.forEach((p) => {
      const u = p.userData, k = (((u.z0 + u.dir * u.speed * T) % 60) + 60) % 60;
      p.position.set(u.x, Math.abs(Math.sin(T * 5 + u.z0)) * 0.03, -50 + k); p.rotation.y = u.dir > 0 ? Math.PI : 0;
    });
  };
  root.visible = false;
  return C;
}
