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
  /* A camera grammar, not one move repeated.
     
     Every chapter had the same shape before this — fall forward, climb out,
     fall forward — and a move you have already seen stops reading as motion.
     Each chapter now gets its own kind of shot, and the cut between them is
     the chapter boundary:

       silence     a crane, high and looking down, descending to level
       first note  a lateral truck, sliding past the figure broadside
       the sweep   a banked spiral, rolling as it closes
       modes       an orbit, swinging around a node
       volume      the rush straight through, kept as it was
       the mark    a slow arc, rising and pulling away
       silence     the long pull back, level, for the struck glyph

     `roll` is a dutch angle per keyframe, interpolated like everything else.
     It is what makes the spiral read as a spiral rather than as a diagonal
     move, and it returns to zero for the mark, because a hallmark photographed
     at an angle looks like a mistake. */
  { t: 0.00, pos: [-180,  920, 1900 ], look: [  40, -120, -260 ], fov: 44, roll: -0.10 },
  { t: 0.09, pos: [-100,  180,  640 ], look: [  90,  -40, -300 ], fov: 62, roll:  0.16 },

  { t: 0.18, pos: [-900,  150, 1000 ], look: [ 120,  -30, -180 ], fov: 54, roll: -0.14 },
  { t: 0.27, pos: [ 520,  -80,  560 ], look: [-180,   40, -260 ], fov: 66, roll:  0.22 },

  { t: 0.36, pos: [ 640, -420, 1150 ], look: [ -80,   60, -120 ], fov: 52, roll:  0.30 },
  { t: 0.44, pos: [-300,  420,  520 ], look: [  90,  -90, -280 ], fov: 66, roll: -0.34 },

  { t: 0.52, pos: [-780,  120,  700 ], look: [  60,  -20, -200 ], fov: 60, roll:  0.12 },
  { t: 0.61, pos: [ 380,  360,  360 ], look: [ -80,  -60, -320 ], fov: 70, roll: -0.26 },

  { t: 0.70, pos: [  70,   50,  430 ], look: [ -40,   10, -280 ], fov: 68, roll:  0.18 },

  { t: 0.79, pos: [-220,  -60,  560 ], look: [  60,   40, -240 ], fov: 62, roll: -0.20 },
  { t: 0.87, pos: [-140,  240,  980 ], look: [  35,  -60, -180 ], fov: 52, roll:  0.08 },

  { t: 1.00, pos: [ 430,  -40, 3050 ], look: [ 430,  -40,    0 ], fov: 40, roll:  0.00 },
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
  { t: 0.00, mode: [0.4, 0.7], gyro: [3.0, 3.0, 3.0], dim: 0, tight: 0.30, jitter: 0.200, lock: 0.95, glyph: 0, scatter: 0, off:  60, thick: 0.80, dive: 0.55 },
  // 02 — the first note: a simple, unmistakable figure
  { t: 0.18, mode: [2, 3],     gyro: [3.2, 3.2, 3.2], dim: 0, tight: 2.20, jitter: 0.030, lock: 0.34, glyph: 0, scatter: 0, off: 110, thick: 0.50, dive: 0.70 },
  // 03 — the sweep: the mode climbs, the figure complicates
  { t: 0.36, mode: [5, 4],     gyro: [3.4, 3.4, 3.4], dim: 0, tight: 2.40, jitter: 0.026, lock: 0.30, glyph: 0, scatter: 0, off: 110, thick: 0.38, dive: 0.58 },
  { t: 0.52, mode: [8, 5],     gyro: [3.2, 3.2, 3.2], dim: 0, tight: 2.60, jitter: 0.024, lock: 0.27, glyph: 0, scatter: 0, off:  70, thick: 0.46, dive: 0.80 },
  // 04 — the field lifts. Grains spread over a surface read far thinner than
  // grains crowded onto lines, so the volume needs fewer, larger cells and a
  // harder pull to hold together.
  { t: 0.70, mode: [9, 6],     gyro: [2.6, 2.6, 2.6], dim: 1, tight: 3.20, jitter: 0.016, lock: 0.30, glyph: 0, scatter: 0, off: 0,   thick: 1.00, dive: 1.00 },
  // 05 — the mark: the field falls quiet so the struck object owns the frame
  { t: 0.88, mode: [9, 9],     gyro: [3.0, 3.0, 3.0], dim: 0, tight: 2.40, jitter: 0.026, lock: 0.26, glyph: 0, scatter: 0, off: -80, thick: 0.42, dive: 0.72 },
  // 06 — the dust resolves into the hallmark, and holds
  { t: 1.00, mode: [9, 9],     gyro: [3.0, 3.0, 3.0], dim: 0, tight: 0.10, jitter: 0.0025, lock: 0.55, glyph: 1, scatter: 0, off: 430, thick: 0.04, dive: 0.10 },
];

/* ------------------------------------------------------------------ *
 * The grain's own geometry, chapter by chapter.
 *
 * Not seven objects — one thing becoming something, so that the shape alone
 * carries the story with the words covered up. Each beat is the previous
 * beat having acquired one more property it did not have before:
 *
 *   0 FILAMENT  an inert thread                     · nothing yet
 *   1 TRIAD     three struts on a hub               · STRUCTURE
 *   2 LANCE     the struts sweep back to a point    · DIRECTION
 *   3 GIMBAL    the barbs close into a ring and bar · AN AXIS
 *   4 CAGE      the ring opens into a braced cell   · VOLUME
 *   5 SEAL      the cell compacts and is struck     · MASS
 *   6 SIGIL     the slab opens into the house mark  · IDENTITY
 *
 * That order is the site's own argument in miniature: formless dust is asked
 * for one property at a time until what is left is a standard. It lands on
 * the same beats as the camera flight and the score, so the grain acquires
 * direction exactly as the field starts to fly, and volume exactly as the
 * field leaves the plate.
 *
 * `align` swings the grains onto the flow of the field — at 1 they all ride
 * the nodal lines and the cloud reads as a shoal. `spin` is each form's own
 * idle rotation: a gimbal turns because that is what a gimbal is for, and a
 * seal does not, because mass sits still.
 * ------------------------------------------------------------------ */
const SHAPE = [
  //                                                           hollow  facet  core  scan  align  spin
  // 01 — silence: a thread with a node in it, and no structure at all
  { t: 0.00, form: 0, elong: 1.00, hollow: 0.90, facet: 0.50, core: 0.10, scan: 0.00, align: 0.00, spin: 0.00 },
  // 02 — the first note: struts and a hub. The grain has become an assembly.
  { t: 0.18, form: 1, elong: 1.00, hollow: 0.52, facet: 0.95, core: 0.50, scan: 0.10, align: 0.25, spin: 0.10 },
  // 03 — the sweep: it draws to a point and every one of them lines up on
  // the ridge it is riding. This is the beat where the field starts to fly.
  { t: 0.36, form: 2, elong: 1.22, hollow: 0.26, facet: 1.05, core: 0.52, scan: 0.30, align: 0.90, spin: 0.00 },
  // the modes climb: it closes into a ring on an axis, and turns
  { t: 0.52, form: 3, elong: 1.00, hollow: 0.38, facet: 1.15, core: 0.55, scan: 0.42, align: 0.50, spin: 0.48 },
  // 04 — the volume: the ring opens into a braced cell as the field lifts
  { t: 0.70, form: 4, elong: 1.00, hollow: 0.16, facet: 1.55, core: 0.48, scan: 0.18, align: 0.40, spin: 0.20 },
  // 05 — the mark: compacted, struck, and holding still
  { t: 0.88, form: 5, elong: 1.25, hollow: 0.10, facet: 1.30, core: 0.92, scan: 0.60, align: 0.72, spin: 0.00 },
  // 06 — struck: the house mark, one grain at a time
  { t: 1.00, form: 6, elong: 1.00, hollow: 0.18, facet: 1.45, core: 1.00, scan: 0.20, align: 0.90, spin: 0.10 },
];

/* A grain's radius in world units. Sizes in the grade table below are
   multipliers on this, not pixel counts: the renderer projects a sphere of
   this radius properly, so a grain grows as the camera closes on it and the
   dive gains its sense of scale for free. */
const GRAIN_RADIUS = 1.85;

/* ------------------------------------------------------------------ *
 * The look.
 * ------------------------------------------------------------------ */
const GRADE = [
  { t: 0.00, bg: '#05070a', cold: '#566d82', hot: '#8ea7bd', size: 1.05, glow: 0.55, opacity: 0.72,
    bloom: 0.34, vig: 0.72, sat: 0.80, lift: 0.004, cast: '#b9cbdb', castAmt: 0.10, exposure: 1.0 },
  { t: 0.18, bg: '#060a0f', cold: '#627e9a', hot: '#cfa95f', size: 1.00, glow: 0.75, opacity: 1.00,
    bloom: 0.40, vig: 0.66, sat: 0.88, lift: 0.005, cast: '#cddced', castAmt: 0.12, exposure: 1.0 },
  { t: 0.36, bg: '#070b12', cold: '#6886a6', hot: '#e3bd6c', size: 0.96, glow: 0.68, opacity: 1.00,
    bloom: 0.36, vig: 0.62, sat: 0.94, lift: 0.006, cast: '#d8e3f0', castAmt: 0.12, exposure: 1.0 },
  { t: 0.52, bg: '#080c14', cold: '#7191b2', hot: '#f0c873', size: 0.92, glow: 0.74, opacity: 1.00,
    bloom: 0.40, vig: 0.58, sat: 1.00, lift: 0.007, cast: '#e2ecf6', castAmt: 0.10, exposure: 1.02 },
  { t: 0.70, bg: '#0a0d16', cold: '#7c9dbf', hot: '#ffd98a', size: 1.18, glow: 1.05, opacity: 1.00,
    bloom: 0.44, vig: 0.50, sat: 1.04, lift: 0.010, cast: '#eef4fb', castAmt: 0.08, exposure: 1.04 },
  { t: 0.88, bg: '#07090e', cold: '#6c8399', hot: '#ffe2a2', size: 0.95, glow: 1.10, opacity: 1.00,
    bloom: 0.46, vig: 0.60, sat: 1.00, lift: 0.006, cast: '#ffeecb', castAmt: 0.16, exposure: 1.02 },
  { t: 1.00, bg: '#05070a', cold: '#5a7084', hot: '#c9a24f', size: 0.60, glow: 0.70, opacity: 0.72,
    bloom: 0.38, vig: 0.70, sat: 0.86, lift: 0.004, cast: '#cfdbe8', castAmt: 0.10, exposure: 1.0 },
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

/* The keyframed dutch angle, written here and read by the camera. Kept beside
   the flight rather than passed back, because it belongs to the shot. */
let flightRoll = 0;

function sampleFlight(t, outPos, outLook) {
  const { i, s } = segment(FLIGHT, t);
  const k = (n) => FLIGHT[THREE.MathUtils.clamp(n, 0, FLIGHT.length - 1)];
  const p0 = k(i - 1), p1 = k(i), p2 = k(i + 1), p3 = k(i + 2);
  for (let c = 0; c < 3; c++) {
    outPos.setComponent(c, cr(p0.pos[c], p1.pos[c], p2.pos[c], p3.pos[c], s));
    outLook.setComponent(c, cr(p0.look[c], p1.look[c], p2.look[c], p3.look[c], s));
  }
  flightRoll = cr(p0.roll, p1.roll, p2.roll, p3.roll, s);
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
  _score.thick   = l(a.thick, b.thick);
  _score.dive    = l(a.dive, b.dive);
  return _score;
}

const _shape = {};

/* The two forms either side of the playhead go to the shader together with
   the eased fraction between them: the silhouette is interpolated on the GPU
   as a distance field, which is the only way an aperture can genuinely become
   a rotor rather than dissolve into one. */
function sampleShape(t) {
  const { a, b, s } = segment(SHAPE, t);
  const e = s * s * (3 - 2 * s);
  const l = (ka, kb) => ka + (kb - ka) * e;
  _shape.formA  = a.form;
  _shape.formB  = b.form;
  _shape.mix    = e;
  _shape.elong  = l(a.elong, b.elong);
  _shape.hollow = l(a.hollow, b.hollow);
  _shape.facet  = l(a.facet, b.facet);
  _shape.core   = l(a.core, b.core);
  _shape.scan   = l(a.scan, b.scan);
  _shape.align  = l(a.align, b.align);
  _shape.spin   = l(a.spin, b.spin);
  return _shape;
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
    /* A cloud reads as a cloud by how many things are in it, and the descent
       puts the camera among them, so this is the number that matters most now.
       It used to be gated behind perfTier >= 0.95, which no retina desktop
       ever cleared — dpr > 1.5 drops the tier to 0.9 — so the large field was
       effectively unreachable on the machines most able to draw it. A dense
       display is not a slow GPU; the pixel ratio is already capped separately
       for that. */
    size: small ? 320 : 640,
    scale: 620,
  });
  scene.add(field.points);

  /* Grains are additively blended, so putting more of them in the same volume
     brightens it in proportion. The compensation is deliberately weaker than
     1/n — some of the extra density should be visible as density, or there was
     no point adding it. */
  const DENSITY_REF = 384 * 384;
  const densityComp = Math.pow(DENSITY_REF / field.count, 0.65);

  const fx = createPostFX(renderer, scene, camera, { quality: perfTier });

  const state = {
    progress: 0,
    target: 0,
    lastTarget: 0,
    agitation: 0,   // how hard the scroll is currently working the plate
    dive: 0,        // how piloted this beat is: parallax, banking, depth of field
    strike: 0,      // decaying impulse from a click
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
  // A fixed basis for the parallax offsets. Reading camera.up here would feed
  // the roll back into the offsets that produce it.
  const WORLD_UP = new THREE.Vector3(0, 1, 0);

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
    /* Scroll speed is bow pressure. Scrubbing hard shakes the plate: the
       grains lose their grip, the figure blurs and goes dark. Come to rest and
       it crystallises and lights up. The reward for stopping is the whole
       point of the piece, so the interaction is the physics, not a flourish. */
    const ag = state.agitation;
    field.sim.uTightness.value = s.tight * (1.0 - ag * 0.55);
    field.sim.uJitter.value = s.jitter * (1.0 + ag * 7.0);
    field.sim.uLockWidth.value = s.lock * (1.0 - ag * 0.45);
    field.sim.uGlyph.value = s.glyph;
    field.sim.uScatter.value = s.scatter;
    field.sim.uThick.value = s.thick;
    field.points.position.x = s.off;
    state.dive = s.dive;

    // a readable "driving frequency" for the UI: mode order, scaled
    state.frequency = Math.round((s.mode.x * s.mode.x + s.mode.y * s.mode.y) * 11.1);
  }

  function applyGrade(t) {
    const g = sampleGrade(t);

    scene.background.copy(g.bg);

    field.uniforms.uCold.value.copy(g.cold);
    field.uniforms.uHot.value.copy(g.hot);
    field.uniforms.uGrainRadius.value = GRAIN_RADIUS * g.size;

    /* Shape follows the scroll, and a shaken plate takes it apart: agitation
       chips the edges, hollows the bodies out, breaks the formation and sets
       the grains tumbling, so scrubbing visibly damages the figure rather
       than only blurring it — and coming to rest visibly repairs it. */
    const sh = sampleShape(t);
    const ag2 = state.agitation;
    field.uniforms.uFormA.value   = sh.formA;
    field.uniforms.uFormB.value   = sh.formB;
    field.uniforms.uFormMix.value = sh.mix;
    field.uniforms.uElong.value   = sh.elong;
    field.uniforms.uHollow.value  = Math.min(1, sh.hollow + ag2 * 0.40);
    field.uniforms.uFacet.value   = sh.facet;
    field.uniforms.uCore.value    = sh.core * (1 - ag2 * 0.55);
    field.uniforms.uScan.value    = sh.scan * (1 - ag2 * 0.70);
    field.uniforms.uAlign.value   = sh.align * (1 - ag2 * 0.85);
    field.uniforms.uSpin.value    = sh.spin;
    field.uniforms.uShatter.value = ag2 * 0.85;
    // the mark owns the last frame; the grains give it back (see uFormFade)
    field.uniforms.uFormFade.value = 1 - field.sim.uGlyph.value;
    field.uniforms.uTumble.value  = ag2 * 0.09;
    field.uniforms.uGlow.value = g.glow;
    field.uniforms.uOpacity.value = g.opacity * densityComp;

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

    // Bow pressure: fast attack so a flick registers at once, slow release so
    // the field visibly takes a moment to settle once you stop.
    const rate = Math.abs(state.target - state.lastTarget) / Math.max(dt, 1e-4);
    state.lastTarget = state.target;
    const want = reducedMotion ? 0 : Math.min(rate * 2.4, 1);
    const grab = want > state.agitation ? 1 - Math.pow(0.002, dt) : 1 - Math.pow(0.28, dt);
    state.agitation += (want - state.agitation) * grab;

    state.strike *= Math.pow(0.015, dt);

    /* The score is applied before the camera, not after it: the camera now
       reads how much of a dive this beat is, and reading it from the previous
       frame lags the banking and the depth of field a frame behind the flight
       they belong to. */
    applyScore(t);
    applyGrade(t);

    const fov = sampleFlight(t, pos, look);

    state.pointerDamped.lerp(state.pointer, reducedMotion ? 1 : 1 - Math.pow(0.004, dt));

    posDamped.copy(pos);
    lookDamped.copy(look);

    const fwd = look.clone().sub(pos).normalize();
    right.crossVectors(fwd, WORLD_UP).normalize();
    up.crossVectors(right, fwd).normalize();

    /* How much of a dive this beat is. It used to be read off uDimension,
       which meant every piloted quality — the bigger hand on the camera, the
       banking, the shallow depth of field — existed only inside the volume
       and the rest of the piece was watched through glass. It is its own
       value in the score now, so a chapter can be flown through whether or
       not the field has left the plate. */
    const dive = state.dive;
    const par = reducedMotion ? 0 : 1 + dive * 2.4;
    posDamped.addScaledVector(right, state.pointerDamped.x * 58 * par);
    posDamped.addScaledVector(up, state.pointerDamped.y * 34 * par);
    lookDamped.addScaledVector(right, state.pointerDamped.x * -20 * par);
    lookDamped.addScaledVector(up, state.pointerDamped.y * -12 * par);

    if (!reducedMotion) {
      posDamped.y += Math.sin(state.time * 0.29) * 3.4;
      posDamped.x += Math.cos(state.time * 0.23) * 2.8;
    }

    camera.position.copy(posDamped);

    /* The shot's own dutch angle, plus what the hand and the scrubbing add on
       top of it. Rolling the up-vector before lookAt is what makes a move read
       as flown rather than watched, and giving each chapter its own angle is
       what stops the flight reading as one long move. */
    const roll = reducedMotion
      ? 0
      : flightRoll + (state.pointerDamped.x * 0.16 + state.agitation * 0.10) * dive;
    if (Math.abs(roll) > 1e-4) {
      camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    } else if (camera.up.x !== 0) {
      camera.up.set(0, 1, 0);
    }

    camera.lookAt(lookDamped);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    // Grain size is a true projection, so it needs the real buffer and FOV.
    field.setProjection(
      THREE.MathUtils.degToRad(camera.fov),
      renderer.domElement.height,
    );

    /* Focus rides the field's centre. The depth of field used to close right
       down inside a dive — 380 units, with the camera sitting in a field
       eleven hundred across — which threw nearly the whole frame out of
       focus. That reads as atmosphere in a still and as mush in motion, and
       it was quietly undoing the contraptions: a form only exists on screen
       while it is sharp enough to have edges. The range stays wide enough now
       that the shapes hold through every shot, and the defocus is left to do
       what it is actually for, which is separating near from far. */
    field.setFocus(
      camera.position.distanceTo(field.points.position),
      THREE.MathUtils.lerp(2000, 1100, dive),
    );

    // drag the pointer through the dust
    if (state.pointerActive && !reducedMotion) {
      ndc.set(state.pointerDamped.x, state.pointerDamped.y);
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(plane, hit)) {
        field.setPointer(hit, 0.85 + state.strike * 7.0);
      } else {
        field.setPointer(null, 0);
      }
    } else {
      field.setPointer(null, 0);
    }

    fx.uniforms.uTime.value = state.time;

    field.update(dt);
    fx.composer.render();
  }

  let loopFailures = 0;
  function tick() {
    // The render loop reschedules itself, so anything thrown inside it would
    // otherwise stop the piece dead and leave a blank page. Keep going, and
    // say so once rather than on every frame.
    try {
      frame();
    } catch (err) {
      if (loopFailures++ === 0) console.error('resonance frame failed:', err);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    renderer, scene, camera, state, field,
    setProgress: (v) => { state.target = THREE.MathUtils.clamp(v, 0, 1); },
    setPointer: (x, y) => { state.pointer.set(x, y); state.pointerActive = true; },
    clearPointer: () => { state.pointerActive = false; },
    /** A struck plate: a transient impulse under the pointer. */
    strike: () => { state.strike = 1; },
    getAgitation: () => state.agitation,
    getFrequency: () => state.frequency,
    resize,
  };
}
