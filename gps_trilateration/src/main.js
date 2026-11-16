import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { createWorld } from './world.js';
import * as A from './assets.js';
import * as S from './shaders.js';
import { SCENE_FRAMES, FPS, TOTAL_FRAMES } from './captions.js';
import { makeCaptions, loadTiming } from './captions_dom.js';
import { runScene } from './timeline.js';
import { clamp, smooth, shake } from './util.js';

const params = new URLSearchParams(location.search);
const SCALE = parseFloat(params.get('scale') || '1');
const W_PX = Math.round(1080 * SCALE), H_PX = Math.round(1920 * SCALE);

const canvas = document.getElementById('c');
canvas.width = W_PX; canvas.height = H_PX;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W_PX, H_PX, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1080 / 1920, 0.05, 2000);

// ---------------------------------------------------------------- post-processing
class DofPass extends Pass {
  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uNear: { value: 0.05 }, uFar: { value: 2000 }, uFocus: { value: 10 }, uAperture: { value: 0 }, uMaxBlur: { value: 26 * SCALE }, uRes: { value: new THREE.Vector2(W_PX, H_PX) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: S.dofFrag, depthTest: false, depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms; u.tDiffuse.value = readBuffer.texture; u.tDepth.value = readBuffer.depthTexture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.fsQuad.render(renderer);
  }
}

const rt = new THREE.WebGLRenderTarget(W_PX, H_PX, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(W_PX, H_PX) });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1); composer.setSize(W_PX, H_PX);
composer.addPass(new RenderPass(scene, camera));
const dof = new DofPass(); composer.addPass(dof);
const bloom = new UnrealBloomPass(new THREE.Vector2(W_PX, H_PX), 0.55, 0.6, 0.9); composer.addPass(bloom);
const finalPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(W_PX, H_PX) }, uGlitch: { value: 0 }, uChroma: { value: 0.001 }, uRadial: { value: 0 }, uRadialC: { value: new THREE.Vector2(0.5, 0.5) },
    uDir: { value: new THREE.Vector2(1, 0) }, uDirAmt: { value: 0 }, uVig: { value: 0.55 }, uGrain: { value: 0.022 }, uFlash: { value: 0 }, uPunch: { value: 0 }, uFade: { value: 0 }, uScan: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: S.finalFrag,
});
composer.addPass(finalPass);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- captions (DOM overlay; ?captions=none renders the bare 3D frames)
const capEl = document.getElementById('captions');
const CAPTIONS = params.get('captions') || 'burn';
if (CAPTIONS === 'none') capEl.style.display = 'none';
const updateCaption = makeCaptions(capEl);

// ---------------------------------------------------------------- frame renderer
let W = null;
const FX0 = () => ({ glitch: 0, chroma: 0.0011, radial: 0, radialC: [0.5, 0.5], dir: [1, 0], dirAmt: 0, vig: 0.5, grain: 0.022, flash: 0, punch: 0, fade: 0, scan: 0, bloom: 0.55, dofFocus: 10, dofAperture: 0 });
const CAM = { pos: new THREE.Vector3(0, 0, 5), tgt: new THREE.Vector3(), fov: 40, roll: 0, near: 0.05, up: null };

function renderFrame(f) {
  f = clamp(Math.round(f), 0, TOTAL_FRAMES - 1);
  const sc = Math.floor(f / SCENE_FRAMES), t = (f % SCENE_FRAMES) / FPS, T = f / FPS;
  W.reset();
  const FX = FX0();
  Object.assign(CAM, { fov: 40, roll: 0, near: 0.05, up: null }); CAM.pos.set(0, 0, 5); CAM.tgt.set(0, 0, 0);
  runScene(sc, { W, FX, CAM, camera, t, T, sc, f });

  // camera (with a very light hand-held drift)
  const dist = CAM.pos.distanceTo(CAM.tgt), amp = 0.0022 * dist;
  camera.fov = CAM.fov; camera.near = CAM.near; camera.far = 2000; camera.aspect = 1080 / 1920; camera.updateProjectionMatrix();
  camera.position.set(CAM.pos.x + amp * shake(T, 1), CAM.pos.y + amp * shake(T, 2), CAM.pos.z + amp * shake(T, 3));
  if (CAM.up) camera.up.copy(CAM.up); else camera.up.set(Math.sin(CAM.roll), Math.cos(CAM.roll), 0);
  camera.lookAt(CAM.tgt);
  camera.updateMatrixWorld(true);
  W.stars.position.copy(camera.position);

  // particle fields: projection scale and wrap centre
  const proj = H_PX / (2 * Math.tan((CAM.fov * Math.PI) / 360));
  W.fields.forEach((fl) => {
    const u = fl.material.uniforms; u.uProj.value = proj; u.uWrapC.value.copy(camera.position);
    if (fl === W.dust || fl === W.bokeh) u.uTime.value = T;
    fl.visible = fl.visible && true;
  });
  W.earthUniforms.uTime.value = T;
  W.spheres.forEach((s) => { s.u.uTime.value = T; });

  // post uniforms
  const du = dof.material.uniforms; du.uNear.value = camera.near; du.uFar.value = camera.far; du.uFocus.value = FX.dofFocus; du.uAperture.value = FX.dofAperture * SCALE;
  dof.enabled = FX.dofAperture > 0.5;
  bloom.strength = FX.bloom;
  const fu = finalPass.uniforms; fu.uTime.value = T; fu.uGlitch.value = FX.glitch; fu.uChroma.value = FX.chroma; fu.uRadial.value = FX.radial; fu.uRadialC.value.set(FX.radialC[0], FX.radialC[1]);
  fu.uDir.value.set(FX.dir[0], FX.dir[1]); fu.uDirAmt.value = FX.dirAmt; fu.uVig.value = FX.vig; fu.uGrain.value = FX.grain; fu.uFlash.value = FX.flash; fu.uPunch.value = FX.punch; fu.uFade.value = FX.fade; fu.uScan.value = FX.scan;

  updateCaption(sc, t);
  composer.render(1 / FPS);
  return { scene: sc, t, f };
}

async function init() {
  await Promise.all([document.fonts.load('700 40px Montserrat'), document.fonts.load('800 40px Montserrat'), document.fonts.load('900 40px Montserrat')]);
  await loadTiming();
  const land = await A.makeLandTexture('./node_modules/world-atlas/land-110m.json');
  W = await createWorld(renderer, scene, land);
  W.reset();
  window.renderFrame = renderFrame;
  window.__dbg = { W, scene, camera, composer, renderer, bloom, dof, finalPass };
  window.__info = { TOTAL_FRAMES, SCENE_FRAMES, FPS, W: W_PX, H: H_PX };
  window.__ready = true;
  const f = params.get('f');
  if (f !== null) renderFrame(parseFloat(f));
}
init().catch((e) => { console.error(e); window.__error = String(e && e.stack || e); });
