// GLSL for the custom materials and post-processing passes.

// ---------------------------------------------------------------- shared uniforms block
// Up to 4 "signal spheres" (satellite range spheres). The Earth shader draws the
// circle where each sphere cuts the surface, and every sphere highlights where it
// overlaps the others.
export const SPHERE_GLSL = /* glsl */ `
uniform vec3  uC[4];
uniform float uR[4];
uniform float uA[4];
uniform vec3  uCol[4];
`;

// ---------------------------------------------------------------- Earth
export const earthVert = /* glsl */ `
varying vec3 vObj; varying vec3 vNW; varying vec3 vWorld;
void main(){
  vObj = normalize(position);
  vNW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const earthFrag = /* glsl */ `
precision highp float;
varying vec3 vObj; varying vec3 vNW; varying vec3 vWorld;
uniform sampler2D uLand;
uniform vec3 uLightDir;
uniform vec3 uUser;          // user position (world)
uniform float uRingAmt;
uniform float uCity;         // 0..1 extra city-light detail around the user
uniform float uTime;
${SPHERE_GLSL}
const float PI = 3.14159265;

float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),f.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=.5; } return s; }

void main(){
  vec3 n = normalize(vObj);
  float lat = asin(clamp(n.y, -1., 1.));
  float lon = atan(n.x, n.z);
  vec2 uv = vec2(lon / (2.*PI) + .5, lat / PI + .5);
  vec2 gx = dFdx(uv), gy = dFdy(uv);
  gx.x -= floor(gx.x + .5); gy.x -= floor(gy.x + .5);          // fix the wrap seam
  vec4 m = textureGrad(uLand, uv, gx, gy);
  float land = m.r, coast = clamp(m.g, 0., 1.);

  vec3 N = normalize(vNW);
  vec3 V = normalize(cameraPosition - vWorld);
  float ndl = dot(N, normalize(uLightDir));
  float lit = smoothstep(-0.25, 0.9, ndl);
  float ndv = clamp(dot(N, V), 0., 1.);

  vec3 ocean = vec3(0.004, 0.012, 0.024);
  vec3 ground = vec3(0.010, 0.036, 0.058);
  vec3 col = mix(ocean, ground, land) * (0.35 + 0.9 * lit);

  // lat/long graticule, 15 degrees
  vec2 g = vec2(lon, lat) / radians(15.);
  vec2 fw = fwidth(g) * 1.2 + 1e-4;
  vec2 gl = 1. - smoothstep(vec2(0.), fw * 1.2, abs(fract(g + .5) - .5));
  float grid = max(gl.x, gl.y) * (1. - smoothstep(.55, .98, abs(n.y)));
  col += vec3(0., .55, .75) * grid * 0.07;

  // glowing coast line
  col += vec3(0.0, 0.55, 1.0) * coast * (0.28 + 0.4 * lit);

  // city lights (sparse speckles on land, clustered by fbm)
  vec2 cuv = uv * vec2(1100., 550.);
  float cl = hash12(floor(cuv));
  float dens = smoothstep(.45, .85, fbm(uv * vec2(26., 13.)));
  float spark = step(1. - .06 * dens - .004, cl) * land;
  float tw = .65 + .35 * sin(uTime * 2. + cl * 40.);
  col += vec3(0.45, 0.85, 1.0) * spark * tw * (1. - lit * .75) * 1.3;

  // close-up: dense city grid around the user's position
  vec2 lp = vWorld.xz - uUser.xz;
  float rr = length(lp);
  float cityMask = exp(-rr * rr / 0.55) * uCity;
  if (cityMask > .003) {
    vec2 q = lp * 22.;
    vec2 blk = floor(q);
    vec2 f = fract(q);
    float street = step(.12, f.x) * step(.12, f.y);
    float b = hash12(blk);
    float lamp = step(.55, b) * street * (.4 + .6 * hash12(blk + 7.));
    float road = (1. - street) * (.35 + .4 * hash12(floor(q * .5)));
    col += vec3(.55, .9, 1.) * (lamp * 1.1 + road * .25) * cityMask;
  }

  // range circles of each satellite sphere on the surface
  float cd = distance(cameraPosition, vWorld);
  for (int k = 0; k < 4; k++){
    float d = abs(distance(vWorld, uC[k]) - uR[k]);
    float w = max(.05, .0035 * cd);
    float ring = exp(-(d*d)/(w*w)) * uA[k] * uRingAmt;
    col += uCol[k] * ring * 1.6;
  }

  // fresnel rim
  float rim = pow(1. - ndv, 3.);
  col += vec3(.05, .36, 1.) * rim * (.25 + .8 * lit);
  gl_FragColor = vec4(col, 1.);
}`;

export const atmoVert = /* glsl */ `
varying vec3 vNW; varying vec3 vWorld;
void main(){ vNW = normalize(mat3(modelMatrix)*normal); vec4 wp = modelMatrix*vec4(position,1.); vWorld = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`;
export const atmoFrag = /* glsl */ `
varying vec3 vNW; varying vec3 vWorld;
uniform vec3 uColor; uniform float uAmt;
void main(){
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = abs(dot(normalize(vNW), V));
  float g = pow(1. - ndv, 4.2);
  gl_FragColor = vec4(uColor * g * uAmt, 1.);
}`;

// ---------------------------------------------------------------- Signal sphere (satellite range)
export const sphereVert = /* glsl */ `
attribute vec3 bary;
varying vec3 vBary; varying vec3 vWorld; varying vec3 vNW;
void main(){
  vBary = bary;
  vNW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const sphereFrag = /* glsl */ `
precision highp float;
varying vec3 vBary; varying vec3 vWorld; varying vec3 vNW;
uniform vec3  uColor;
uniform vec3  uCenter;
uniform vec3  uAxis;
uniform float uOpacity;
uniform float uWire;        // polygon wireframe amount
uniform float uBands;       // expanding wave bands (pulse look)
uniform float uTime;
uniform float uRingAmt;     // glow on the intersection circles with other spheres
uniform float uZoneAmt;     // glow on the overlap zone
uniform float uZoneR;       // radius (world) of the "search space" around the target
uniform vec3  uTarget;
uniform int   uSelf;
uniform float uDim;
${SPHERE_GLSL}
void main(){
  vec3 N = normalize(vNW);
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = abs(dot(N, V));
  float fres = pow(1. - ndv, 2.2);

  float mn = min(min(vBary.x, vBary.y), vBary.z);
  float fw = fwidth(mn);
  float edge = 1. - smoothstep(fw * .6, fw * 1.7, mn);

  float ang = acos(clamp(dot(normalize(vWorld - uCenter), uAxis), -1., 1.));
  float bands = pow(.5 + .5 * sin(ang * 26. - uTime * 8.), 5.) * uBands;

  float cd = distance(cameraPosition, vWorld);
  float ring = 0.; vec3 ringCol = vec3(0.); float inside = 1.;
  for (int k = 0; k < 4; k++){
    if (k == uSelf) continue;
    float d = distance(vWorld, uC[k]) - uR[k];
    float w = max(.07, .0032 * cd);
    float rg = exp(-(d*d)/(w*w)) * uA[k];
    ring += rg; ringCol += uCol[k] * rg;
    inside *= mix(1., smoothstep(.4, -.4, d), uA[k]);
  }
  float zoneF = exp(-pow(distance(vWorld, uTarget) / max(uZoneR, .01), 2.));
  float zone = inside * zoneF;

  vec3 col = uColor * (.045 + fres * .55) * uOpacity;
  col += uColor * edge * uWire * .85;
  col += uColor * bands * .45 * uOpacity;
  col += (ringCol * 1.7 + vec3(1.) * ring * .25) * uRingAmt;
  col += (uColor * .8 + vec3(.25)) * zone * uZoneAmt * .26;
  gl_FragColor = vec4(col * uDim, 1.);
}`;

// ---------------------------------------------------------------- Beam (laser / light column)
export const beamVert = /* glsl */ `
varying vec2 vUv; varying vec3 vNW; varying vec3 vWorld;
void main(){
  vUv = uv; vNW = normalize(mat3(modelMatrix)*normal);
  vec4 wp = modelMatrix*vec4(position,1.); vWorld = wp.xyz;
  gl_Position = projectionMatrix*viewMatrix*wp;
}`;
export const beamFrag = /* glsl */ `
varying vec2 vUv; varying vec3 vNW; varying vec3 vWorld;
uniform vec3 uColor; uniform float uLen; uniform float uTime; uniform float uPulse; uniform float uAmt; uniform float uFade;
void main(){
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = abs(dot(normalize(vNW), V));
  float core = pow(ndv, 1.6);
  float p = .55 + .45 * sin(vUv.y * uLen * 2.4 - uTime * 24.);
  p = mix(1., p, uPulse);
  float f = mix(1., smoothstep(1., .6, vUv.y), uFade);      // optional fade towards the tip
  gl_FragColor = vec4(uColor * core * p * uAmt * f, 1.);
}`;

// ---------------------------------------------------------------- Particles
export const partVert = /* glsl */ `
attribute vec3 aVel; attribute float aSeed;
uniform float uTime; uniform float uSize; uniform float uProj; uniform vec3 uWrapC; uniform float uWrap;
uniform float uMaxPx; uniform float uTw;
varying float vA; varying float vSeed;
void main(){
  vec3 p = position + aVel * uTime;
  if (uWrap > 0.) p = uWrapC + mod(p - uWrapC + uWrap*.5, uWrap) - uWrap*.5;
  vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.);
  float px = uSize * uProj / max(-mv.z, .05);
  float tw = mix(1., .55 + .45 * sin(uTime * 4. + aSeed * 61.), uTw);
  gl_PointSize = clamp(px * tw, 1., uMaxPx);
  vA = tw; vSeed = aSeed;
  gl_Position = projectionMatrix * mv;
}`;
export const partFrag = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha;
varying float vA; varying float vSeed;
void main(){
  float d = length(gl_PointCoord - .5) * 2.;
  float a = smoothstep(1., 0., d); a *= a;
  vec3 c = mix(uColor, vec3(1.), .35 * fract(vSeed * 7.));
  gl_FragColor = vec4(c * a * uAlpha * vA, 1.);
}`;

// ---------------------------------------------------------------- Post: depth of field
export const dofFrag = /* glsl */ `
#include <packing>
varying vec2 vUv;
uniform sampler2D tDiffuse; uniform sampler2D tDepth;
uniform float uNear; uniform float uFar; uniform float uFocus; uniform float uAperture; uniform float uMaxBlur; uniform vec2 uRes;
float linDepth(vec2 uv){
  float d = texture2D(tDepth, uv).x;
  if (d > .99999) return uFocus * 3.2;
  return -perspectiveDepthToViewZ(d, uNear, uFar);
}
float coc(float z){ return clamp(abs(z - uFocus) / max(z, .01) * uAperture, 0., uMaxBlur); }
void main(){
  vec4 c0 = texture2D(tDiffuse, vUv);
  float z0 = linDepth(vUv);
  float c = coc(z0);
  if (c < .6) { gl_FragColor = c0; return; }
  vec3 acc = c0.rgb; float ws = 1.;
  const int N = 36;
  for (int i = 1; i < N; i++){
    float fi = float(i);
    float a = fi * 2.39996323;
    float r = sqrt(fi / float(N)) * c;
    vec2 uv = vUv + vec2(cos(a), sin(a)) * r / uRes;
    float z = linDepth(uv);
    float sc = coc(z);
    float w = (z < z0) ? clamp(sc / max(r, .5), 0., 1.) : 1.;      // sharp foreground does not bleed outward
    acc += texture2D(tDiffuse, uv).rgb * w; ws += w;
  }
  gl_FragColor = vec4(acc / ws, c0.a);
}`;

// ---------------------------------------------------------------- Post: final FX (glitch, aberration, blur, vignette, grain, flash)
export const finalFrag = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float uTime; uniform vec2 uRes;
uniform float uGlitch; uniform float uChroma; uniform float uRadial; uniform vec2 uRadialC;
uniform vec2 uDir; uniform float uDirAmt;
uniform float uVig; uniform float uGrain; uniform float uFlash; uniform float uFade; uniform float uScan;
float h11(float n){ return fract(sin(n * 91.3458) * 47453.5453); }
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 samp(vec2 uv){ return texture2D(tDiffuse, uv).rgb; }
void main(){
  vec2 uv = vUv;
  float tq = floor(uTime * 24.);
  vec2 off = vec2(0.);
  // --- glitch: displaced horizontal bands + blocks
  if (uGlitch > .001){
    float band = floor(uv.y * 28. + tq * 3.7);
    float r = h11(band + tq * 1.3);
    if (r < uGlitch * .55) off.x += (h11(band * 3.1 + tq) - .5) * .22 * uGlitch;
    float bx = floor(uv.x * 9. + tq), by = floor(uv.y * 16. - tq * 2.);
    if (h21(vec2(bx, by) + tq) < uGlitch * .10) { off += (vec2(h21(vec2(bx, by)), h21(vec2(by, bx))) - .5) * .12; }
  }
  uv += off;
  // --- chromatic aberration (radial) + glitch split
  vec2 cdir = (uv - .5);
  float ca = uChroma + uGlitch * .012;
  vec2 rgbOff = cdir * ca * 2.0 + vec2(uGlitch * .010, 0.);
  vec3 col;
  // --- directional / radial blur
  vec2 bdir = uDir * uDirAmt;
  vec2 rdir = (uRadialC - uv) * uRadial;
  if (uDirAmt > .0005 || uRadial > .0005){
    vec3 acc = vec3(0.); float ws = 0.;
    for (int i = 0; i < 24; i++){
      float t = float(i) / 23. - .5;
      vec2 o = bdir * t + rdir * (float(i) / 23.);
      vec3 s = vec3(samp(uv + o + rgbOff).r, samp(uv + o).g, samp(uv + o - rgbOff).b);
      float w = 1. - abs(t) * .6; acc += s * w; ws += w;
    }
    col = acc / ws;
  } else {
    col = vec3(samp(uv + rgbOff).r, samp(uv).g, samp(uv - rgbOff).b);
  }
  // glitch colour noise / scan inversions
  if (uGlitch > .001){
    float line = step(.985 - uGlitch * .05, h11(floor(vUv.y * 160.) + tq));
    col = mix(col, col.bgr * 1.6, line * uGlitch);
  }
  // vignette
  vec2 q = vUv - .5; q.x *= .75;
  float vig = smoothstep(.95, .25, length(q));
  col *= mix(1., vig, uVig);
  // scan lines (very subtle)
  col *= 1. - uScan * (.5 + .5 * sin(vUv.y * uRes.y * 1.5));
  // film grain / dither (also kills banding in the dark gradients)
  float g = h21(vUv * uRes + fract(uTime) * 91.7) - .5;
  col += g * uGrain;
  col += vec3(uFlash);
  col *= 1. - uFade;
  gl_FragColor = vec4(max(col, 0.), 1.);
}`;
