import * as THREE from 'three';
import { createTerrain } from './terrain.js';
import { createClouds } from './clouds.js';
import { createOcean } from './ocean.js';
import { createPostFX } from './postfx.js';

/* ------------------------------------------------------------------ *
 * The flight path.
 *
 * Seven beats carrying the camera from above the cloud deck, down through
 * it, under the weather into the storm sea, into the vault chamber, and
 * finally back up into dawn light. `t` is global scroll progress.
 * ------------------------------------------------------------------ */
/* The altitude of the cloud deck. Terrain haze, the cloud slab and the camera
   flight are all keyed to it, so moving the weather moves everything together. */
const DECK_Y = 300;

const FLIGHT = [
  { t: 0.00, pos: [ 320,  880,  1180 ], look: [   10,  700, -1900 ], fov: 44 },
  { t: 0.17, pos: [ 356,  726,   520 ], look: [   70,  596, -2200 ], fov: 43 },
  { t: 0.35, pos: [ 400,  438,  -260 ], look: [  240,  366, -2600 ], fov: 42 },
  { t: 0.53, pos: [ 360,  -40,  -980 ], look: [  420,   10, -3100 ], fov: 42 },
  { t: 0.71, pos: [ 180, -430, -1720 ], look: [   60, -400, -3700 ], fov: 41 },
  { t: 0.87, pos: [ -90, -352, -2460 ], look: [  -40, -300, -4400 ], fov: 43 },
  { t: 1.00, pos: [ -40,  330, -3180 ], look: [  180,  470, -5300 ], fov: 46 },
];

/* ------------------------------------------------------------------ *
 * The colour journey — ice → slate → storm → vault gold → dawn.
 * ------------------------------------------------------------------ */
const GRADE = [
  { t: 0.00, bg: '#e1e8ed', fog: '#dfe6eb', cLight: '#ffffff', cDark: '#9cadbc', tint: '#ffffff', tintAmt: 0.00,
    density: 0.88, cast: '#ffffff', castAmt: 0.00, lift: 0.006, sat: 0.97, vig: 0.30, bloom: 0.13, exposure: 1.00 },
  { t: 0.20, bg: '#d6dfe6', fog: '#d4dde4', cLight: '#fbfdfe', cDark: '#8d9fb0', tint: '#eef4f8', tintAmt: 0.10,
    density: 1.00, cast: '#f4f8fb', castAmt: 0.10, lift: 0.008, sat: 0.95, vig: 0.34, bloom: 0.15, exposure: 1.00 },
  { t: 0.38, bg: '#a9b8c5', fog: '#a6b5c2', cLight: '#e8eff4', cDark: '#67798a', tint: '#cdd9e3', tintAmt: 0.14,
    density: 1.24, cast: '#dde6ee', castAmt: 0.18, lift: 0.010, sat: 0.88, vig: 0.44, bloom: 0.18, exposure: 0.94 },
  { t: 0.56, bg: '#36434f', fog: '#333f4a', cLight: '#8d9daa', cDark: '#39454f', tint: '#7e8f9d', tintAmt: 0.16,
    density: 1.05, cast: '#b9c8d4', castAmt: 0.24, lift: 0.010, sat: 0.80, vig: 0.54, bloom: 0.36, exposure: 0.92 },
  { t: 0.72, bg: '#141c24', fog: '#131b23', cLight: '#62727f', cDark: '#1a232c', tint: '#5c6c7a', tintAmt: 0.18,
    density: 0.86, cast: '#9fb0be', castAmt: 0.28, lift: 0.006, sat: 0.78, vig: 0.62, bloom: 0.42, exposure: 0.90 },
  { t: 0.88, bg: '#100f0d', fog: '#14120e', cLight: '#6b5c3c', cDark: '#191713', tint: '#c8a24c', tintAmt: 0.34,
    density: 0.72, cast: '#e6c88e', castAmt: 0.30, lift: 0.008, sat: 0.86, vig: 0.60, bloom: 0.52, exposure: 0.94 },
  { t: 1.00, bg: '#d9d2c4', fog: '#dcd4c5', cLight: '#fff4de', cDark: '#b6a68c', tint: '#e7ce92', tintAmt: 0.38,
    density: 0.92, cast: '#fff1d8', castAmt: 0.26, lift: 0.026, sat: 0.94, vig: 0.34, bloom: 0.44, exposure: 1.04 },
];

/* text colour per chapter, pushed into CSS custom properties */
const UI_THEME = [
  { t: 0.00, fg: '#1b2430', soft: '#5f7285', faint: '#93a3b2', rule: 'rgba(27,36,48,.18)',    accent: '#a8842f', scrim: '#e1e8ed' },
  { t: 0.30, fg: '#16202b', soft: '#4d6074', faint: '#7f91a2', rule: 'rgba(22,32,43,.20)',    accent: '#9d7a2a', scrim: '#c4d0da' },
  { t: 0.50, fg: '#f2f6f8', soft: '#b3c1cd', faint: '#7f8e9c', rule: 'rgba(242,246,248,.18)', accent: '#c8a24c', scrim: '#28333d' },
  { t: 0.88, fg: '#f6f2e8', soft: '#bdb39d', faint: '#8a806c', rule: 'rgba(246,242,232,.16)', accent: '#e7ce92', scrim: '#100f0d' },
  { t: 1.00, fg: '#1e1b14', soft: '#5b5445', faint: '#8d8676', rule: 'rgba(30,27,20,.20)',    accent: '#8a6c28', scrim: '#d9d2c4' },
];

/* ------------------------------------------------------------------ *
 * interpolation helpers
 * ------------------------------------------------------------------ */
function segment(keys, t) {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const span = Math.max(b.t - a.t, 1e-6);
  return { i, a, b, s: THREE.MathUtils.clamp((t - a.t) / span, 0, 1) };
}

/* Catmull-Rom on one component — keeps velocity continuous across beats */
function cr(p0, p1, p2, p3, s) {
  const s2 = s * s;
  const s3 = s2 * s;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * s +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * s2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * s3
  );
}

function sampleFlight(t, outPos, outLook) {
  const { i, s } = segment(FLIGHT, t);
  const k = (n) => FLIGHT[THREE.MathUtils.clamp(n, 0, FLIGHT.length - 1)];
  const p0 = k(i - 1), p1 = k(i), p2 = k(i + 1), p3 = k(i + 2);

  for (let c = 0; c < 3; c++) {
    outPos.setComponent(c, cr(p0.pos[c], p1.pos[c], p2.pos[c], p3.pos[c], s));
    outLook.setComponent(c, cr(p0.look[c], p1.look[c], p2.look[c], p3.look[c], s));
  }
  return cr(p0.fov, p1.fov, p2.fov, p3.fov, s);
}

const _cA = new THREE.Color();
const _cB = new THREE.Color();

/* Reusable result objects — sampleGrade/sampleUI run every frame, so nothing
   in here allocates. */
const _grade = {
  bg: new THREE.Color(), fog: new THREE.Color(), cLight: new THREE.Color(),
  cDark: new THREE.Color(), tint: new THREE.Color(), cast: new THREE.Color(),
  tintAmt: 0, density: 0, castAmt: 0, lift: 0, sat: 0, vig: 0, bloom: 0, exposure: 1,
};

function sampleGrade(t) {
  const { a, b, s } = segment(GRADE, t);
  const e = s * s * (3 - 2 * s);
  const into = (out, ka, kb) => out.set(ka).lerp(_cB.set(kb), e);
  const lerp = (ka, kb) => ka + (kb - ka) * e;

  into(_grade.bg, a.bg, b.bg);
  into(_grade.fog, a.fog, b.fog);
  into(_grade.cLight, a.cLight, b.cLight);
  into(_grade.cDark, a.cDark, b.cDark);
  into(_grade.tint, a.tint, b.tint);
  into(_grade.cast, a.cast, b.cast);

  _grade.tintAmt  = lerp(a.tintAmt, b.tintAmt);
  _grade.density  = lerp(a.density, b.density);
  _grade.castAmt  = lerp(a.castAmt, b.castAmt);
  _grade.lift     = lerp(a.lift, b.lift);
  _grade.sat      = lerp(a.sat, b.sat);
  _grade.vig      = lerp(a.vig, b.vig);
  _grade.bloom    = lerp(a.bloom, b.bloom);
  _grade.exposure = lerp(a.exposure, b.exposure);

  return _grade;
}

function sampleUI(t) {
  const { a, b, s } = segment(UI_THEME, t);
  const e = s * s * (3 - 2 * s);
  const mixHex = (ka, kb) => '#' + _cA.set(ka).lerp(_cB.set(kb), e).getHexString();
  const c = _cA.set(a.scrim).lerp(_cB.set(b.scrim), e);
  // rule colours are rgba strings — swap at the midpoint rather than parse them
  return {
    fg:     mixHex(a.fg, b.fg),
    soft:   mixHex(a.soft, b.soft),
    faint:  mixHex(a.faint, b.faint),
    accent: mixHex(a.accent, b.accent),
    scrim:  `${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}`,
    rule:   e < 0.5 ? a.rule : b.rule,
  };
}

/* ------------------------------------------------------------------ *
 * World
 * ------------------------------------------------------------------ */
export function createWorld(canvas, { reducedMotion = false } = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const perfTier = window.innerWidth < 760 ? 0.72 : dpr > 1.5 ? 0.9 : 1;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(dpr, perfTier < 0.8 ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e1e8ed');

  const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 1, 14000);
  camera.position.set(...FLIGHT[0].pos);

  /* ---- content ---- */
  const terrain = createTerrain({
    segments: perfTier < 0.8 ? 220 : 360,
    deckY: DECK_Y,
  });
  scene.add(terrain.mesh);

  // a second, further massif adds the layered silhouettes of the reference
  const ridge = createTerrain({
    size: 17000,
    segments: perfTier < 0.8 ? 140 : 210,
    amplitude: 360,
    frequency: 0.00038,
    seed: 41.3,
    deckY: DECK_Y,
    peaks: [[-3800, -7200], [2900, -8100], [-600, -9000]],
  });
  ridge.mesh.position.set(0, -110, -2600);
  ridge.uniforms.uFogDensity.value = 0.00017;
  ridge.uniforms.uExposure.value = 0.80;
  ridge.mesh.renderOrder = 0;
  scene.add(ridge.mesh);

  // the range that greets the camera when it climbs back into dawn light
  const dawnRidge = createTerrain({
    size: 15000,
    segments: perfTier < 0.8 ? 140 : 220,
    amplitude: 400,
    frequency: 0.00044,
    seed: 77.9,
    deckY: -60,
    peaks: [[900, -6400], [-2600, -7400], [3400, -8300]],
  });
  dawnRidge.mesh.position.set(0, -260, -5200);
  dawnRidge.uniforms.uFogDensity.value = 0.00015;
  dawnRidge.uniforms.uOpacity.value = 0;
  dawnRidge.mesh.renderOrder = 0;
  dawnRidge.mesh.visible = false;
  scene.add(dawnRidge.mesh);

  const clouds = createClouds({
    count: perfTier < 0.8 ? 420 : 940,
    spread: 7600,
    deckY: DECK_Y,
    thickness: 430,
    minScale: 250,
    maxScale: 880,
  });
  scene.add(clouds.mesh);

  // a thin upper veil so there is weather above the camera too
  const veil = createClouds({
    count: perfTier < 0.8 ? 90 : 190,
    spread: 8400,
    deckY: 1250,
    thickness: 340,
    minScale: 900,
    maxScale: 2400,
  });
  veil.uniforms.uDensity.value = 0.34;
  veil.uniforms.uSoft.value = 0.42;
  veil.mesh.renderOrder = 6;
  scene.add(veil.mesh);

  const ocean = createOcean({ size: 14000, y: -860 });
  scene.add(ocean.mesh);

  const fx = createPostFX(renderer, scene, camera, { quality: perfTier });

  /* ---- state ---- */
  const state = {
    progress: 0,
    target: 0,
    pointer: new THREE.Vector2(),
    pointerDamped: new THREE.Vector2(),
    time: 0,
    altitude: 0,
  };

  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const lookDamped = new THREE.Vector3(...FLIGHT[0].look);
  const posDamped = new THREE.Vector3(...FLIGHT[0].pos);
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();

  const root = document.documentElement;
  let lastUI = null;
  let lastUIStep = -1;

  function applyGrade(t) {
    const g = sampleGrade(t);

    scene.background.copy(g.bg);

    terrain.uniforms.uFog.value.copy(g.fog);
    terrain.uniforms.uExposure.value = g.exposure;
    ridge.uniforms.uFog.value.copy(g.fog);
    ridge.uniforms.uExposure.value = g.exposure * 0.92;
    dawnRidge.uniforms.uFog.value.copy(g.fog);
    dawnRidge.uniforms.uExposure.value = g.exposure;

    clouds.uniforms.uLight.value.copy(g.cLight);
    clouds.uniforms.uDark.value.copy(g.cDark);
    clouds.uniforms.uTint.value.copy(g.tint);
    clouds.uniforms.uTintAmount.value = g.tintAmt;
    clouds.uniforms.uDensity.value = g.density;

    veil.uniforms.uLight.value.copy(g.cLight);
    veil.uniforms.uDark.value.copy(g.cDark);
    veil.uniforms.uTint.value.copy(g.tint);
    veil.uniforms.uTintAmount.value = g.tintAmt;
    veil.uniforms.uDensity.value = g.density * 0.34;

    ocean.uniforms.uFog.value.copy(g.fog);

    fx.uniforms.uCast.value.copy(g.cast);
    fx.uniforms.uCastAmount.value = g.castAmt;
    fx.uniforms.uLift.value = g.lift;
    fx.uniforms.uSaturation.value = g.sat;
    fx.uniforms.uVignette.value = g.vig;
    fx.bloom.strength = g.bloom;

    // the summits dissolve into the deck as the camera sinks through it
    const massifOut = 1 - THREE.MathUtils.smoothstep(t, 0.40, 0.56);
    terrain.uniforms.uOpacity.value = massifOut;
    ridge.uniforms.uOpacity.value = massifOut;
    terrain.mesh.visible = massifOut > 0.01;
    ridge.mesh.visible = massifOut > 0.01;

    // the sea only exists under the weather
    const seaIn = THREE.MathUtils.smoothstep(t, 0.50, 0.66);
    const seaOut = 1 - THREE.MathUtils.smoothstep(t, 0.90, 0.97);
    ocean.uniforms.uOpacity.value = seaIn * seaOut;
    ocean.mesh.visible = ocean.uniforms.uOpacity.value > 0.01;

    // and a new range rises for the last chapter
    const dawnIn = THREE.MathUtils.smoothstep(t, 0.88, 0.99);
    dawnRidge.uniforms.uOpacity.value = dawnIn;
    dawnRidge.mesh.visible = dawnIn > 0.01;

    // UI colour — resample only when the journey has moved a meaningful step,
    // and only touch the DOM when the result actually differs
    const step = Math.round(t * 240);
    if (step === lastUIStep) return;
    lastUIStep = step;

    const ui = sampleUI(t);
    if (!lastUI || ui.fg !== lastUI.fg || ui.accent !== lastUI.accent || ui.rule !== lastUI.rule) {
      root.style.setProperty('--fg', ui.fg);
      root.style.setProperty('--fg-soft', ui.soft);
      root.style.setProperty('--fg-faint', ui.faint);
      root.style.setProperty('--rule', ui.rule);
      root.style.setProperty('--accent', ui.accent);
      root.style.setProperty('--scrim-rgb', ui.scrim);
      lastUI = ui;
    }
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    fx.composer.setSize(w, h);
    fx.bloom.setSize(w, h);
  }
  window.addEventListener('resize', resize, { passive: true });

  const clock = new THREE.Clock();

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    state.time += dt;

    // damped scroll — this is what makes the flight feel weighted
    const ease = reducedMotion ? 1 : 1 - Math.pow(0.0016, dt);
    state.progress += (state.target - state.progress) * ease;

    const t = state.progress;
    const fov = sampleFlight(t, pos, look);

    // pointer parallax in camera space
    state.pointerDamped.lerp(state.pointer, reducedMotion ? 1 : 1 - Math.pow(0.004, dt));

    posDamped.copy(pos);
    lookDamped.copy(look);

    const fwd = look.clone().sub(pos).normalize();
    right.crossVectors(fwd, camera.up).normalize();
    up.crossVectors(right, fwd).normalize();

    const par = reducedMotion ? 0 : 1;
    posDamped.addScaledVector(right, state.pointerDamped.x * 42 * par);
    posDamped.addScaledVector(up, state.pointerDamped.y * 26 * par);
    lookDamped.addScaledVector(right, state.pointerDamped.x * -16 * par);
    lookDamped.addScaledVector(up, state.pointerDamped.y * -10 * par);

    // a breath of handheld drift so nothing feels locked to a rail
    if (!reducedMotion) {
      posDamped.y += Math.sin(state.time * 0.31) * 3.2;
      posDamped.x += Math.cos(state.time * 0.24) * 2.6;
    }

    camera.position.copy(posDamped);
    camera.lookAt(lookDamped);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    clouds.uniforms.uTime.value = state.time;
    veil.uniforms.uTime.value = state.time;
    ocean.uniforms.uTime.value = state.time;
    fx.uniforms.uTime.value = state.time;

    applyGrade(t);

    // 4 478 m at the summit, falling to sea level under the weather
    state.altitude = Math.max(0, Math.round((camera.position.y + 620) * 5.4));

    fx.composer.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    renderer, scene, camera, state,
    setProgress: (v) => { state.target = THREE.MathUtils.clamp(v, 0, 1); },
    setPointer: (x, y) => { state.pointer.set(x, y); },
    getAltitude: () => state.altitude,
    resize,
  };
}
