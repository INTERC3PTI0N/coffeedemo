import * as THREE from 'three';
import { createResonance } from './resonance.js';
import { createPostFX } from './postfx.js';

/* ------------------------------------------------------------------ *
 * The flight.
 *
 * Seven beats carrying the camera from far above a dark plate, down onto
 * the figure, inside the volume once the field lifts, and back out to
 * read the struck mark.
 * ------------------------------------------------------------------ */
const FLIGHT = [
  // A Chladni figure only reads whole. For the plate chapters the camera sits
  // back and square-on; it only leaves that vantage to dive into the volume.
  { t: 0.00, pos: [   0,    0, 3050 ], look: [   0,    0,    0 ], fov: 40 },
  { t: 0.18, pos: [-150,  100, 2340 ], look: [   0,    0,    0 ], fov: 38 },
  { t: 0.36, pos: [ 230, -130, 2120 ], look: [   0,    0,    0 ], fov: 38 },
  { t: 0.52, pos: [-270,  170, 1940 ], look: [   0,    0,    0 ], fov: 38 },
  { t: 0.70, pos: [  70,   50,  430 ], look: [ -40,   10, -280 ], fov: 68 },
  { t: 0.87, pos: [ -70,   50, 1520 ], look: [   0,    0,    0 ], fov: 42 },
  { t: 1.00, pos: [ 430,  -40, 3050 ], look: [ 430,  -40,    0 ], fov: 40 },
];

/* ------------------------------------------------------------------ *
 * The score.
 *
 * Each beat is a driving condition for the plate. `mode` are the Chladni
 * numbers, `lock` is how near a node a grain must sit to read as settled,
 * `dim` lifts the field off the plate into the gyroid volume.
 * ------------------------------------------------------------------ */
const SCORE = [
  // `off` slides the plate clear of the column of type, the way a subject is
  // placed off-centre; the volume dive and the struck mark recentre it.
  // 01 — silence: no mode, wide lock, the dust is formless
  { t: 0.00, mode: [0.4, 0.7], gyro: [3.0, 3.0, 3.0], dim: 0, tight: 0.30, jitter: 0.200, lock: 0.95, glyph: 0, scatter: 0, off: 120 },
  // 02 — the first note: a simple, unmistakable figure
  { t: 0.18, mode: [2, 3],     gyro: [3.2, 3.2, 3.2], dim: 0, tight: 2.20, jitter: 0.030, lock: 0.34, glyph: 0, scatter: 0, off: 380 },
  // 03 — the sweep: the mode climbs, the figure complicates
  { t: 0.36, mode: [5, 4],     gyro: [3.4, 3.4, 3.4], dim: 0, tight: 2.40, jitter: 0.026, lock: 0.30, glyph: 0, scatter: 0, off: 360 },
  { t: 0.52, mode: [8, 5],     gyro: [3.2, 3.2, 3.2], dim: 0, tight: 2.60, jitter: 0.024, lock: 0.27, glyph: 0, scatter: 0, off: 330 },
  // 04 — the field lifts. Grains spread over a surface read far thinner than
  // grains crowded onto lines, so the volume needs fewer, larger cells and a
  // harder pull to hold together.
  { t: 0.70, mode: [9, 6],     gyro: [2.6, 2.6, 2.6], dim: 1, tight: 3.20, jitter: 0.016, lock: 0.30, glyph: 0, scatter: 0, off: 0 },
  // 05 — the mark: the field falls quiet so the struck object owns the frame
  { t: 0.88, mode: [9, 9],     gyro: [3.0, 3.0, 3.0], dim: 0, tight: 2.40, jitter: 0.026, lock: 0.26, glyph: 0, scatter: 0, off: -300 },
  // 06 — the dust resolves into the hallmark, and holds
  { t: 1.00, mode: [9, 9],     gyro: [3.0, 3.0, 3.0], dim: 0, tight: 0.10, jitter: 0.0025, lock: 0.55, glyph: 1, scatter: 0, off: 430 },
];

/* ------------------------------------------------------------------ *
 * The look.
 * ------------------------------------------------------------------ */
const GRADE = [
  { t: 0.00, bg: '#05070a', cold: '#566d82', hot: '#8ea7bd', size: 3.1, glow: 0.7, opacity: 0.55,
    bloom: 0.55, vig: 0.72, sat: 0.80, lift: 0.004, cast: '#b9cbdb', castAmt: 0.10, exposure: 1.0 },
  { t: 0.18, bg: '#060a0f', cold: '#627e9a', hot: '#cfa95f', size: 3.2, glow: 1.1, opacity: 0.85,
    bloom: 0.70, vig: 0.66, sat: 0.88, lift: 0.005, cast: '#cddced', castAmt: 0.12, exposure: 1.0 },
  { t: 0.36, bg: '#070b12', cold: '#6886a6', hot: '#e3bd6c', size: 3.3, glow: 1.4, opacity: 0.95,
    bloom: 0.80, vig: 0.62, sat: 0.94, lift: 0.006, cast: '#d8e3f0', castAmt: 0.12, exposure: 1.0 },
  { t: 0.52, bg: '#080c14', cold: '#7191b2', hot: '#f0c873', size: 2.5, glow: 1.7, opacity: 1.00,
    bloom: 0.92, vig: 0.58, sat: 1.00, lift: 0.007, cast: '#e2ecf6', castAmt: 0.10, exposure: 1.02 },
  { t: 0.70, bg: '#0a0d16', cold: '#7c9dbf', hot: '#ffd98a', size: 2.6, glow: 2.0, opacity: 1.00,
    bloom: 1.05, vig: 0.50, sat: 1.04, lift: 0.010, cast: '#eef4fb', castAmt: 0.08, exposure: 1.04 },
  { t: 0.88, bg: '#07090e', cold: '#6c8399', hot: '#ffe2a2', size: 2.9, glow: 2.2, opacity: 1.00,
    bloom: 1.10, vig: 0.60, sat: 1.00, lift: 0.006, cast: '#ffeecb', castAmt: 0.16, exposure: 1.02 },
  { t: 1.00, bg: '#05070a', cold: '#5a7084', hot: '#c9a24f', size: 2.7, glow: 1.0, opacity: 0.72,
    bloom: 0.62, vig: 0.70, sat: 0.86, lift: 0.004, cast: '#cfdbe8', castAmt: 0.10, exposure: 1.0 },
];

/* text colour per chapter — the page is dark throughout, so this barely moves */
const UI_THEME = [
  { t: 0.00, fg: '#dfe7ee', soft: '#8ba0b4', faint: '#5c6f82', rule: 'rgba(223,231,238,.14)', accent: '#b9873c', scrim: '#05070a' },
  { t: 0.45, fg: '#f0f5f9', soft: '#a3b7c9', faint: '#6d8196', rule: 'rgba(240,245,249,.16)', accent: '#e3bd6c', scrim: '#070b12' },
  { t: 0.88, fg: '#fbf3e2', soft: '#c3b294', faint: '#8a7c64', rule: 'rgba(251,243,226,.18)', accent: '#ffe2a2', scrim: '#07090e' },
  { t: 1.00, fg: '#dfe7ee', soft: '#8ba0b4', faint: '#5c6f82', rule: 'rgba(223,231,238,.14)', accent: '#b9873c', scrim: '#05070a' },
];

/* ------------------------------------------------------------------ *
 * interpolation
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
const _cC = new THREE.Color();

const _score = { mode: new THREE.Vector2(), gyro: new THREE.Vector3() };

function sampleScore(t) {
  const { a, b, s } = segment(SCORE, t);
  const e = s * s * (3 - 2 * s);
  const l = (ka, kb) => ka + (kb - ka) * e;

  _score.mode.set(l(a.mode[0], b.mode[0]), l(a.mode[1], b.mode[1]));
  _score.gyro.set(l(a.gyro[0], b.gyro[0]), l(a.gyro[1], b.gyro[1]), l(a.gyro[2], b.gyro[2]));
  _score.dim     = l(a.dim, b.dim);
  _score.tight   = l(a.tight, b.tight);
  _score.jitter  = l(a.jitter, b.jitter);
  _score.lock    = l(a.lock, b.lock);
  _score.glyph   = l(a.glyph, b.glyph);
  _score.scatter = l(a.scatter, b.scatter);
  _score.off     = l(a.off, b.off);
  return _score;
}

const _grade = {
  bg: new THREE.Color(), cold: new THREE.Color(), hot: new THREE.Color(), cast: new THREE.Color(),
  size: 2, glow: 1, opacity: 1, bloom: 1, vig: 0.6, sat: 1, lift: 0, castAmt: 0, exposure: 1,
};

function sampleGrade(t) {
  const { a, b, s } = segment(GRADE, t);
  const e = s * s * (3 - 2 * s);
  const into = (out, ka, kb) => out.set(ka).lerp(_cB.set(kb), e);
  const l = (ka, kb) => ka + (kb - ka) * e;

  into(_grade.bg, a.bg, b.bg);
  into(_grade.cold, a.cold, b.cold);
  into(_grade.hot, a.hot, b.hot);
  into(_grade.cast, a.cast, b.cast);

  _grade.size     = l(a.size, b.size);
  _grade.glow     = l(a.glow, b.glow);
  _grade.opacity  = l(a.opacity, b.opacity);
  _grade.bloom    = l(a.bloom, b.bloom);
  _grade.vig      = l(a.vig, b.vig);
  _grade.sat      = l(a.sat, b.sat);
  _grade.lift     = l(a.lift, b.lift);
  _grade.castAmt  = l(a.castAmt, b.castAmt);
  _grade.exposure = l(a.exposure, b.exposure);
  return _grade;
}

function sampleUI(t) {
  const { a, b, s } = segment(UI_THEME, t);
  const e = s * s * (3 - 2 * s);
  const mixHex = (ka, kb) => '#' + _cA.set(ka).lerp(_cB.set(kb), e).getHexString();

  // _cC, not _cA: mixHex below reuses _cA, so sharing it would hand the scrim
  // whichever colour was mixed last.
  const sc = _cC.set(a.scrim).lerp(_cB.set(b.scrim), e);
  const scrim = `${Math.round(sc.r * 255)}, ${Math.round(sc.g * 255)}, ${Math.round(sc.b * 255)}`;

  return {
    fg: mixHex(a.fg, b.fg),
    soft: mixHex(a.soft, b.soft),
    faint: mixHex(a.faint, b.faint),
    accent: mixHex(a.accent, b.accent),
    scrim,
    rule: e < 0.5 ? a.rule : b.rule,
  };
}

/* ------------------------------------------------------------------ *
 * World
 * ------------------------------------------------------------------ */
export function createWorld(canvas, { reducedMotion = false } = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const small = window.innerWidth < 760;
  const perfTier = small ? 0.72 : dpr > 1.5 ? 0.9 : 1;

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
  scene.background = new THREE.Color('#05070a');

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 1, 9000);
  camera.position.set(...FLIGHT[0].pos);

  const field = createResonance(renderer, {
    size: small ? 192 : perfTier < 0.95 ? 288 : 384,
    scale: 620,
  });
  scene.add(field.points);

  const fx = createPostFX(renderer, scene, camera, { quality: perfTier });

  const state = {
    progress: 0,
    target: 0,
    pointer: new THREE.Vector2(),
    pointerDamped: new THREE.Vector2(),
    pointerActive: false,
    time: 0,
    frequency: 0,
  };

  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const posDamped = new THREE.Vector3(...FLIGHT[0].pos);
  const lookDamped = new THREE.Vector3(...FLIGHT[0].look);
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();

  // pointer → a point on the plate, for the finger-through-dust disturbance
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  const ndc = new THREE.Vector2();

  const root = document.documentElement;
  let lastUI = null;
  let lastUIStep = -1;

  function applyScore(t) {
    const s = sampleScore(t);
    field.sim.uMode.value.copy(s.mode);
    field.sim.uGyroid.value.copy(s.gyro);
    field.sim.uDimension.value = s.dim;
    field.sim.uTightness.value = s.tight;
    field.sim.uJitter.value = s.jitter;
    field.sim.uLockWidth.value = s.lock;
    field.sim.uGlyph.value = s.glyph;
    field.sim.uScatter.value = s.scatter;
    field.points.position.x = s.off;

    // a readable "driving frequency" for the UI: mode order, scaled
    state.frequency = Math.round((s.mode.x * s.mode.x + s.mode.y * s.mode.y) * 11.1);
  }

  function applyGrade(t) {
    const g = sampleGrade(t);

    scene.background.copy(g.bg);

    field.uniforms.uCold.value.copy(g.cold);
    field.uniforms.uHot.value.copy(g.hot);
    field.uniforms.uSize.value = g.size;
    field.uniforms.uGlow.value = g.glow;
    field.uniforms.uOpacity.value = g.opacity;

    fx.uniforms.uCast.value.copy(g.cast);
    fx.uniforms.uCastAmount.value = g.castAmt;
    fx.uniforms.uLift.value = g.lift;
    fx.uniforms.uSaturation.value = g.sat;
    fx.uniforms.uVignette.value = g.vig;
    fx.bloom.strength = g.bloom;

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
    field.resize();
  }
  window.addEventListener('resize', resize, { passive: true });

  const clock = new THREE.Clock();

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    state.time += dt;

    const ease = reducedMotion ? 1 : 1 - Math.pow(0.0016, dt);
    state.progress += (state.target - state.progress) * ease;
    const t = state.progress;

    const fov = sampleFlight(t, pos, look);

    state.pointerDamped.lerp(state.pointer, reducedMotion ? 1 : 1 - Math.pow(0.004, dt));

    posDamped.copy(pos);
    lookDamped.copy(look);

    const fwd = look.clone().sub(pos).normalize();
    right.crossVectors(fwd, camera.up).normalize();
    up.crossVectors(right, fwd).normalize();

    const par = reducedMotion ? 0 : 1;
    posDamped.addScaledVector(right, state.pointerDamped.x * 58 * par);
    posDamped.addScaledVector(up, state.pointerDamped.y * 34 * par);
    lookDamped.addScaledVector(right, state.pointerDamped.x * -20 * par);
    lookDamped.addScaledVector(up, state.pointerDamped.y * -12 * par);

    if (!reducedMotion) {
      posDamped.y += Math.sin(state.time * 0.29) * 3.4;
      posDamped.x += Math.cos(state.time * 0.23) * 2.8;
    }

    camera.position.copy(posDamped);
    camera.lookAt(lookDamped);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    // drag the pointer through the dust
    if (state.pointerActive && !reducedMotion) {
      ndc.set(state.pointerDamped.x, state.pointerDamped.y);
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(plane, hit)) {
        field.setPointer(hit, 0.85);
      } else {
        field.setPointer(null, 0);
      }
    } else {
      field.setPointer(null, 0);
    }

    applyScore(t);
    applyGrade(t);
    fx.uniforms.uTime.value = state.time;

    field.update(dt);
    fx.composer.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    renderer, scene, camera, state, field,
    setProgress: (v) => { state.target = THREE.MathUtils.clamp(v, 0, 1); },
    setPointer: (x, y) => { state.pointer.set(x, y); state.pointerActive = true; },
    clearPointer: () => { state.pointerActive = false; },
    getFrequency: () => state.frequency,
    resize,
  };
}
