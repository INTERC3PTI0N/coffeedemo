import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

/**
 * The resonance field.
 *
 * A hundred thousand grains of assay dust on a driven plate. Every frame the
 * GPU integrates each grain down the gradient of a standing-wave field, so the
 * grains migrate off the antinodes and pile onto the nodal set — the places
 * that are not moving. That is a real Chladni figure, not an animation of one:
 * change the mode numbers and the pattern reorganises itself because the maths
 * underneath changed, the same way sand does on a steel plate.
 *
 * Two fields are blended by `uDimension`:
 *
 *   0 — a square plate. Nodal *lines*, the classic figures.
 *   1 — a volume. The nodal set becomes a gyroid, a triply periodic minimal
 *       surface, which the camera can fly through.
 *
 * `uLockWidth` is the storytelling dial: it decides how close to a node a grain
 * must be to count as settled, and settled grains are drawn hot. Sweeping the
 * frequency past a true mode makes the whole field ignite and then fall dark
 * again, which is the entire narrative of the site in one uniform.
 */

const FIELD = /* glsl */ `
  #define PI 3.141592653589793

  /* --- plate: S = 0 traces the nodal lines --- */
  float plate(vec2 p, vec2 nm) {
    float a = nm.x * PI, b = nm.y * PI;
    return cos(a * p.x) * cos(b * p.y) - cos(b * p.x) * cos(a * p.y);
  }
  vec2 plateGrad(vec2 p, vec2 nm) {
    float a = nm.x * PI, b = nm.y * PI;
    return vec2(
      -a * sin(a * p.x) * cos(b * p.y) + b * sin(b * p.x) * cos(a * p.y),
      -b * cos(a * p.x) * sin(b * p.y) + a * cos(b * p.x) * sin(a * p.y)
    );
  }

  /* --- volume: S = 0 is the gyroid surface --- */
  float volume(vec3 p, vec3 k) {
    return sin(k.x * p.x) * cos(k.y * p.y)
         + sin(k.y * p.y) * cos(k.z * p.z)
         + sin(k.z * p.z) * cos(k.x * p.x);
  }
  vec3 volumeGrad(vec3 p, vec3 k) {
    return vec3(
      k.x * cos(k.x * p.x) * cos(k.y * p.y) - k.x * sin(k.z * p.z) * sin(k.x * p.x),
      k.y * cos(k.y * p.y) * cos(k.z * p.z) - k.y * sin(k.x * p.x) * sin(k.y * p.y),
      k.z * cos(k.z * p.z) * cos(k.x * p.x) - k.z * sin(k.y * p.y) * sin(k.z * p.z)
    );
  }

`;

const SIM = /* glsl */ `
${FIELD}

  uniform float uTime;
  uniform float uDt;       // clamped — the force integration is stiff
  uniform float uDtReal;   // wall-clock — for unconditionally stable blends
  uniform vec2  uMode;         // Chladni mode numbers (n, m)
  uniform vec3  uGyroid;       // volumetric wavenumbers
  uniform float uDimension;    // 0 = plate, 1 = volume
  uniform float uTightness;    // how hard grains are pulled to the nodes
  uniform float uJitter;       // thermal agitation — keeps the figure alive
  uniform float uLockWidth;    // distance from a node that still counts as settled
  uniform float uGlyph;        // blend toward the struck mark
  uniform float uScatter;      // blow the field apart
  uniform vec3  uPointer;      // world-space pointer, for local disturbance
  uniform float uPointerForce;

  uniform sampler2D uTargets;  // per-grain position inside the glyph

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  vec3 hash3(vec2 p) {
    return vec3(hash(p), hash(p + 17.3), hash(p + 43.7));
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 state = texture2D(texturePosition, uv);
    vec3 pos = state.xyz;

    /* --- the two fields, blended --- */
    float sP = plate(pos.xy, uMode);
    vec2  gP = plateGrad(pos.xy, uMode);
    float sV = volume(pos, uGyroid);
    vec3  gV = volumeGrad(pos, uGyroid);

    // descend |S|^2 — the grain walks away from the shaking and onto the still.
    // The bow lifts as the mark forms: without this the plate keeps driving
    // grains onto its nodal lines while the glyph pulls them to the digits,
    // the two forces fight, and the mark never resolves.
    float drive = 1.0 - uGlyph;
    vec3 force = vec3(0.0);
    force.xy += -2.0 * sP * gP * (1.0 - uDimension) * drive;
    force    += -2.0 * sV * gV * uDimension * drive;

    // on the plate the grains are pressed flat; in the volume they are free
    force.z += -pos.z * 6.0 * (1.0 - uDimension);

    // clamped step keeps the descent stable when the gradient is steep
    vec3 step = force * uTightness * uDt;
    pos += clamp(step, vec3(-0.06), vec3(0.06));

    /* --- the struck mark ---
       A fixed fraction per frame would make the mark form at whatever rate the
       device happens to render, which on a slow machine means it never arrives.
       An exponential on wall-clock time converges in the same span everywhere.
       Safe to use the unclamped dt here: mix() cannot overshoot. */
    vec3 target = texture2D(uTargets, uv).xyz;
    float pull = 1.0 - exp(-uGlyph * 7.0 * uDtReal);
    pos = mix(pos, target, pull);

    /* --- pointer disturbance: a finger dragged through the dust --- */
    vec3 d = pos - uPointer;
    float dist = length(d);
    pos += normalize(d + 1e-5) * uPointerForce * exp(-dist * dist * 5.0) * uDt;

    /* --- agitation, and the scatter that ends the piece --- */
    vec3 noise = hash3(uv + fract(uTime * 0.37)) - 0.5;
    pos += noise * (uJitter + uScatter * 2.4) * uDt;

    /* --- soft containment --- */
    float r = length(pos);
    if (r > 1.9) pos -= normalize(pos) * (r - 1.9) * 0.6;

    /* --- how settled is this grain? --- */
    float s = mix(abs(sP), abs(sV), uDimension);
    float lock = 1.0 - smoothstep(0.0, uLockWidth, s);
    // with the plate silent, |S| at a grain's position is meaningless — the
    // struck mark is settled by definition, so light all of it
    lock = mix(lock, 1.0, uGlyph);
    lock *= 1.0 - uScatter;

    gl_FragColor = vec4(pos, lock);
  }
`;

const RENDER_VERT = /* glsl */ `
${FIELD}

  uniform sampler2D uPosition;

  /* dimensions, in world units — a grain is an actual size, not a magic number */
  uniform float uGrainRadius;   // radius of a loose grain
  uniform float uSettledGain;   // a settled grain has grown a facet; it reads larger
  uniform float uProjScale;     // drawingBufferHeight / (2 tan(fovY/2))
  uniform float uMinPx;
  uniform float uMaxPx;

  /* focus */
  uniform float uFocus;
  uniform float uFocusRange;
  uniform float uBokeh;

  /* the field the grain is sitting on */
  uniform vec2  uMode;
  uniform vec3  uGyroid;
  uniform float uDimension;
  uniform vec3  uLightDir;

  /* the grain's own geometry, morphed by the scroll */
  uniform float uElong;
  uniform float uTumble;
  uniform float uTime;

  attribute vec2 aRef;
  attribute float aSeed;

  varying float vLock;
  varying float vSeed;
  varying float vBlur;
  varying float vShade;
  varying float vGlint;
  varying float vDepth;
  varying vec2  vAxis;    // screen direction the flake is longest in
  varying float vSquash;  // minor/major — how edge-on we are seeing it

  void main() {
    vec4 state = texture2D(uPosition, aRef);
    vec3 pos = state.xyz;
    vLock = state.w;
    vSeed = aSeed;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float depth = max(-mv.z, 0.001);
    vDepth = depth;

    /* --- the grain is a flake lying *in* the nodal set, so the field's own
       gradient is its normal: on the plate the slope of the ridge it piled
       into, in the volume the true normal of the gyroid surface. --- */
    vec2 gp = plateGrad(pos.xy, uMode);
    vec3 gv = volumeGrad(pos, uGyroid);
    vec3 n = normalize(mix(vec3(gp * 0.35, 1.0), gv, uDimension) + 1e-5);

    vec3 viewDir = normalize(cameraPosition - (modelMatrix * vec4(pos, 1.0)).xyz);
    float facing = abs(dot(n, viewDir));

    float lambert = dot(n, normalize(uLightDir));
    vShade = 0.70 + 0.36 * (lambert * 0.5 + 0.5);

    // a facet catches the light directly now and then, which is what makes it
    // read as mineral rather than as a dot
    vec3 halfway = normalize(normalize(uLightDir) + viewDir);
    vGlint = pow(max(dot(n, halfway), 0.0), 26.0) * vLock;

    /* --- the flake's silhouette ---
       Widest across the direction perpendicular to both its normal and the
       eye; foreshortened to a sliver as it turns edge-on. That ellipse is
       the shape, so the geometry itself carries the depth. --- */
    vec3 t = cross(n, viewDir);
    float tlen = length(t);
    t = tlen > 1e-4 ? t / tlen : vec3(1.0, 0.0, 0.0);

    vec3 tv = (modelViewMatrix * vec4(t, 0.0)).xyz;
    vec2 scr = vec2(tv.x - mv.x * tv.z / mv.z, tv.y - mv.y * tv.z / mv.z);
    scr = vec2(projectionMatrix[0][0] * scr.x, projectionMatrix[1][1] * scr.y);

    float slen = length(scr);
    vec2 axis = slen > 1e-6 ? scr / slen : vec2(1.0, 0.0);

    // No two flakes settle at quite the same angle, and a shaken plate sets
    // them tumbling at their own rates.
    float wob = (aSeed - 0.5) * 0.7
              + uTumble * (aSeed - 0.5) * 9.0
              + uTumble * uTime * (0.6 + aSeed * 1.8);
    float cw = cos(wob), sw = sin(wob);
    vAxis = vec2(axis.x * cw - axis.y * sw, axis.x * sw + axis.y * cw);

    vSquash = clamp(facing, 0.16, 1.0);

    /* --- true projected size of a sphere of this radius --- */
    float radius = uGrainRadius
                 * mix(1.0, uSettledGain, vLock)
                 * (0.72 + aSeed * 0.56);

    float px = 2.0 * radius * uProjScale / depth;

    // an elongated grain needs a longer sprite to live in
    px *= mix(1.0, sqrt(max(uElong, 1.0)), 0.6);

    float coc = clamp(abs(depth - uFocus) / uFocusRange, 0.0, 1.0);
    coc *= coc;
    vBlur = coc;
    px *= 1.0 + coc * uBokeh;

    gl_PointSize = clamp(px, uMinPx, uMaxPx);
    gl_Position = projectionMatrix * mv;
  }
`;

const RENDER_FRAG = /* glsl */ `
  precision highp float;

  uniform vec3  uCold;      // drifting, unresolved
  uniform vec3  uHot;       // settled on a node
  uniform vec3  uHaze;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uBokeh;
  uniform float uHazeDensity;
  uniform float uHazeNear;
  uniform float uFacet;     // how hard-edged the crystal reads
  uniform float uSides;     // 3 triangle · 4 diamond · 6 hexagon · high = round
  uniform float uElong;     // 1 equant · >1 drawn out into a needle
  uniform float uRound;     // corner bluntness
  uniform float uHollow;    // 1 outline only · 0 solid
  uniform float uSpike;     // edges pulled into a star

  varying float vLock;
  varying float vSeed;
  varying float vBlur;
  varying float vShade;
  varying float vGlint;
  varying float vDepth;
  varying vec2  vAxis;
  varying float vSquash;

  /* One shape for the whole piece, described continuously rather than chosen
     from a set: uSides slides from a round mote through triangle, diamond
     and hexagon; uSpike pulls the edges into a star; uRound blunts the
     corners; uElong draws it out into a needle. Morphing the parameters
     morphs the grain, so the geometry can follow the scroll the way the
     colour and the physics already do. */
  float grainSDF(vec2 p, float sides, float radius, float spike) {
    float a = atan(p.y, p.x);
    float seg = 6.2831853 / sides;

    // fold the plane into one wedge of the polygon
    float fold = cos(floor(0.5 + a / seg) * seg - a) * length(p);

    // pulling the radius with the angle turns the polygon into a star
    float r = radius * (1.0 - spike * cos(sides * a));
    return fold - r;
  }

  void main() {
    vec2 q = gl_PointCoord - 0.5;

    // into the flake's own frame: long across its axis, squashed across the
    // other as it turns edge-on to us
    vec2 p = vec2(q.x * vAxis.x + q.y * vAxis.y,
                 -q.x * vAxis.y + q.y * vAxis.x);
    p.y /= max(vSquash, 0.16);
    p.x /= max(uElong, 0.001);

    // keep the longest axis inside the sprite it is drawn in
    float radius = 0.32 / max(1.0, uElong * 0.7);

    float d = grainSDF(p, uSides, radius, uSpike) - uRound * radius * 0.5;
    if (d > 0.24) discard;

    // A loose grain is a hollow outline — a marker for something not yet
    // there. A settled one has filled in and taken an edge. How hollow the
    // loose state reads is itself part of the shape's journey.
    float edge = fwidth(d) + 0.004;
    float fill = smoothstep(edge, -edge, d);
    float rim  = exp(-abs(d) * (42.0 * uFacet));
    float loose = mix(fill * 0.5 + rim * 0.7, rim, uHollow);
    float shell = mix(loose, fill * 0.62 + rim * 0.9, vLock);

    // diffraction spikes off the facets of the ones that have locked hard
    float spike = (exp(-abs(p.y) * 52.0) + exp(-abs(p.x) * 52.0))
                * exp(-dot(p, p) * 5.0) * vLock * 0.26;

    // defocus takes the aperture's shape rather than dissolving to a smudge
    float soft = smoothstep(0.24, -0.16, d) * (0.72 + 0.5 * smoothstep(-0.02, 0.16, d));
    float shape = mix(shell + spike, soft, vBlur);

    vec3 col = mix(uCold, uHot, smoothstep(0.15, 0.95, vLock));
    col *= vShade;
    col *= 0.72 + vLock * uGlow;
    col += uHot * vGlint * 0.40;

    float a = shape * uOpacity * (0.19 + vLock * 0.40) * (0.62 + vSeed * 0.46);

    // spreading a grain over a wider disc must not brighten it
    a /= 1.0 + vBlur * uBokeh * 0.85;

    // atmosphere: distance drains the dust toward the dark it hangs in
    float haze = 1.0 - exp(-max(vDepth - uHazeNear, 0.0) * uHazeDensity);
    col = mix(col, uHaze, haze * 0.62);
    a *= 1.0 - haze * 0.42;

    if (a < 0.002) discard;
    gl_FragColor = vec4(col, a);
  }
`;

/** Render "999" and rejection-sample it for per-grain glyph targets. */
function glyphTargets(count, width = 512, height = 256) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d', { willReadFrequently: true });

  g.fillStyle = '#000';
  g.fillRect(0, 0, width, height);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '400 200px "Jost", sans-serif';
  g.letterSpacing = '10px';
  g.fillText('999', width / 2, height / 2 + 6);

  const px = g.getImageData(0, 0, width, height).data;

  // collect opaque pixels once, then draw from them
  const ink = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (px[(y * width + x) * 4] > 110) ink.push(x, y);
    }
  }

  const out = new Float32Array(count * 4);
  const n = ink.length / 2;

  for (let i = 0; i < count; i++) {
    if (n === 0) break;
    const k = (Math.random() * n) | 0;
    const x = ink[k * 2] + Math.random();
    const y = ink[k * 2 + 1] + Math.random();

    out[i * 4 + 0] = (x / width - 0.5) * 4.6;
    out[i * 4 + 1] = -(y / height - 0.5) * 2.3;
    out[i * 4 + 2] = (Math.random() - 0.5) * 0.02;
    out[i * 4 + 3] = 1;
  }
  return out;
}

export function createResonance(renderer, { size = 320, scale = 620 } = {}) {
  const count = size * size;

  const gpu = new GPUComputationRenderer(size, size, renderer);
  if (renderer.capabilities.isWebGL2 === false) gpu.setDataType(THREE.HalfFloatType);

  /* ---- initial state: formless drift ---- */
  const initial = gpu.createTexture();
  const data = initial.image.data;
  for (let i = 0; i < count; i++) {
    // a flat-ish cloud, so the first mode has somewhere to gather from
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 1.25;
    data[i * 4 + 0] = Math.cos(a) * r;
    data[i * 4 + 1] = Math.sin(a) * r;
    data[i * 4 + 2] = (Math.random() - 0.5) * 0.5;
    data[i * 4 + 3] = 0;
  }

  const targets = new THREE.DataTexture(
    glyphTargets(count), size, size, THREE.RGBAFormat, THREE.FloatType,
  );
  targets.needsUpdate = true;

  const posVar = gpu.addVariable('texturePosition', SIM, initial);
  gpu.setVariableDependencies(posVar, [posVar]);

  const sim = posVar.material.uniforms;
  Object.assign(sim, {
    uTime:         { value: 0 },
    uDt:           { value: 1 / 60 },
    uDtReal:       { value: 1 / 60 },
    uMode:         { value: new THREE.Vector2(1, 2) },
    uGyroid:       { value: new THREE.Vector3(4.2, 4.2, 4.2) },
    uDimension:    { value: 0 },
    uTightness:    { value: 0.9 },
    uJitter:       { value: 0.06 },
    uLockWidth:    { value: 0.35 },
    uGlyph:        { value: 0 },
    uScatter:      { value: 0 },
    uPointer:      { value: new THREE.Vector3(9, 9, 9) },
    uPointerForce: { value: 0 },
    uTargets:      { value: targets },
  });

  const err = gpu.init();
  if (err !== null) console.error('resonance field failed to initialise:', err);

  /* ---- the drawn grains ---- */
  const geometry = new THREE.BufferGeometry();
  const refs = new Float32Array(count * 2);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    refs[i * 2 + 0] = (i % size) / size;
    refs[i * 2 + 1] = Math.floor(i / size) / size;
    seeds[i] = Math.random();
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('aRef', new THREE.BufferAttribute(refs, 2));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3);

  const uniforms = {
    uPosition:    { value: null },

    // Dimensions are world-unit radii. The field is scaled by `scale`, so a
    // grain of 1.5 here is 1.5 world units across the plate's ~2000-unit span
    // — roughly a grain of silica on a 240mm plate, held to that ratio.
    uGrainRadius: { value: 1.85 },
    uSettledGain: { value: 1.22 },
    uProjScale:   { value: 800 },
    uMinPx:       { value: 0.9 },
    uMaxPx:       { value: 38 },

    uFocus:       { value: 1200 },
    uFocusRange:  { value: 900 },
    uBokeh:       { value: 3.2 },

    // shared with the simulation so shading always matches the physics
    uMode:        sim.uMode,
    uGyroid:      sim.uGyroid,
    uDimension:   sim.uDimension,
    uLightDir:    { value: new THREE.Vector3(-0.42, 0.68, 0.6) },

    uCold:        { value: new THREE.Color('#5d7286') },
    uHot:         { value: new THREE.Color('#e7c274') },
    uHaze:        { value: new THREE.Color('#070a0f') },
    uOpacity:     { value: 1 },
    uGlow:        { value: 1.3 },
    uFacet:       { value: 1.0 },
    uSides:       { value: 6 },
    uElong:       { value: 1 },
    uRound:       { value: 0 },
    uHollow:      { value: 0.2 },
    uSpike:       { value: 0 },
    uTumble:      { value: 0 },
    uTime:        sim.uTime,
    uHazeDensity: { value: 0.00035 },
    uHazeNear:    { value: 500 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: RENDER_VERT,
    fragmentShader: RENDER_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.scale.setScalar(scale);
  points.frustumCulled = false;

  const _p = new THREE.Vector3();

  return {
    points,
    uniforms,
    sim,
    count,

    update(dt) {
      sim.uTime.value += dt;
      // the force integration needs a small step to stay stable; the blends do
      // not, and starving them of real time is what stalls the mark
      sim.uDt.value = Math.min(dt, 1 / 30);
      sim.uDtReal.value = Math.min(dt, 0.25);
      gpu.compute();
      uniforms.uPosition.value = gpu.getCurrentRenderTarget(posVar).texture;
    },

    /** Pointer in world space, converted into the field's local units. */
    setPointer(worldPos, force) {
      if (!worldPos) {
        sim.uPointerForce.value = 0;
        return;
      }
      _p.copy(worldPos).divideScalar(scale);
      sim.uPointer.value.copy(_p);
      sim.uPointerForce.value = force;
    },

    /**
     * The exact pixel scale of the projection: a sphere of radius r at view
     * distance d covers 2 r uProjScale / d pixels. Feed it the real drawing
     * buffer height and vertical FOV and grain sizes become a physical
     * quantity rather than something tuned by eye per viewport.
     */
    setProjection(fovYRadians, drawingBufferHeight) {
      uniforms.uProjScale.value = drawingBufferHeight / (2 * Math.tan(fovYRadians / 2));
    },

    /** Focal distance, in view units, and the depth over which focus falls off. */
    setFocus(distance, range) {
      uniforms.uFocus.value = distance;
      uniforms.uHazeNear.value = distance * 0.7;
      if (range !== undefined) uniforms.uFocusRange.value = range;
    },

    resize() {},

    dispose() {
      gpu.dispose?.();
      geometry.dispose();
      material.dispose();
      targets.dispose();
    },
  };
}
