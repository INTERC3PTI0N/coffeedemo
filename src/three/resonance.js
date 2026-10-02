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

  /* One hash, shared by the simulation and the renderer, so both agree to the
     bit on which grains are atmosphere rather than figure. Two copies of
     "roughly the same" random function would classify differently and the
     atmosphere would be simulated as one set and drawn as another. */
  float ghash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float ambientOf(vec2 uv) {
    return step(0.79, ghash(uv * 7.31 + 3.7));
  }

  /* The hero grains.

     A form needs something like a dozen pixels before a bevel, a chamfer and
     an interior can be told apart, and a grain in a field of six hundred
     thousand is two or three. Selecting the ones that happen to be big enough
     to draw as solids therefore selected almost nothing, which is why the
     objects were still not visible however carefully they were lit: the pass
     that draws them was running on a handful of grains in the deepest frame
     of the piece and on none at all anywhere else.

     So a fiftieth of the field is promoted. Those grains are drawn several
     times larger and always as solids, and they are what the reader actually
     sees the shape of. The remaining ninety-eight per cent stay exactly as
     they were — fine, numerous, and carrying the figure — because a Chladni
     pattern is made of the many, not of the few. One field at two scales: the
     dust that draws the figure, and the objects that show what the dust is. */
  float heroOf(vec2 uv) {
    return step(0.9935, ghash(uv * 11.17 + 29.3));
  }

  /* --- terrain: a range the dust settles onto ---

     The plate and the gyroid are both exact: a figure and a minimal surface,
     each one the solution to an equation. A landscape is the opposite kind of
     thing, and that is the point of putting one in the middle of them — the
     grains spend the whole piece finding mathematics, and here they find
     geology instead, briefly, before the mark.

     Ridged fractal noise: the absolute value of a noise field inverted and
     squared, summed over octaves. Taking the ridge rather than the valley is
     what makes crests sharp and flanks smooth, which is the difference
     between mountains and hills. */
  /* A lattice hash that is actually uniform. The sine-and-fract hash used
     elsewhere in this file is fine for scattering single grains, but sampled
     on integer lattice points and interpolated it has visible structure —
     repeated squiggles and a square grain running through the whole field —
     and five octaves of it builds warts rather than mountains. This one
     distributes properly, which is the whole difference between landform and
     melted plastic. */
  float lhash(vec2 i) {
    vec3 p3 = fract(vec3(i.x, i.y, i.x) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  /* Gradient noise, not value noise.

     Value noise interpolates heights sampled at lattice points, and with a
     smooth interpolant it is C1 continuous everywhere — it cannot hold a
     sharp crest, so ridging it produces rounded dunes and the lattice cells
     show through as blobs. Gradient noise interpolates *slopes* instead and
     is zero at every lattice point, which is what lets a ridge stay a ridge.

     Raising the ridge to a power was also backwards: a power above one
     flattens the region near the peak rather than sharpening it. What
     sharpens a range is the multifractal weighting below — each octave is
     multiplied by the one above it, so detail collects on the crests and the
     valleys stay smooth, which is how erosion actually leaves a mountain. */
  vec2 grad2(vec2 i) {
    float a = lhash(i) * 6.2831853;
    return vec2(cos(a), sin(a));
  }

  float gnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = dot(grad2(i),                  f);
    float b = dot(grad2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float c = dot(grad2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
    float d = dot(grad2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.42;
  }

  float terrainAt(vec2 p) {
    float h = 0.0, amp = 0.55, frq = 0.62, norm = 0.0, prev = 1.0;
    for (int i = 0; i < 5; i++) {
      float n = 1.0 - abs(gnoise(p * frq + 17.3));
      n *= n;
      n *= prev;                       // detail collects where the last octave was high
      prev = clamp(n * 1.7, 0.0, 1.0);
      h += n * amp;
      norm += amp;
      amp *= 0.5;
      frq *= 2.03;
    }
    h /= norm;
    // sit the range low in the field so the camera flies above the crests
    return h * 2.05 - 0.78;
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
  uniform float uThick;        // half-depth of the plate's slab, in field units
  uniform float uTerrain;      // 0 the field is a figure · 1 it is a landscape
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

    /* A fifth of the field never joins the figure.
    
       The figure is bounded — it has to be, it is a plate — and once the
       camera is down inside it the edge of that bound is simply black, which
       is what was leaving half the frame empty on the closer shots. These
       grains ignore the drive entirely and hang wide as atmosphere, so there
       is always something between the lens and the dark however the camera is
       pointed. They never settle, so they stay cold and dim and cannot be
       mistaken for part of the figure: they read as the air it is suspended
       in, which is what a plate of dust should have around it anyway.

       Getting the quantity right matters more than the idea. A first pass put
       a twelfth of the grains into a shell of radius 4.4, spreading them
       through twelve times the figure's volume and leaving them some hundred
       and fifty times too sparse to register — the frame stayed exactly as
       black as before. A fifth of the field, in a shell a little over half
       that size, is what actually reads as air. */
    float amb = ambientOf(uv);

    /* --- the two fields, blended --- */
    float sP = plate(pos.xy, uMode);
    vec2  gP = plateGrad(pos.xy, uMode);
    float sV = volume(pos, uGyroid);
    vec3  gV = volumeGrad(pos, uGyroid);

    // descend |S|^2 — the grain walks away from the shaking and onto the still.
    // The bow lifts as the mark forms: without this the plate keeps driving
    // grains onto its nodal lines while the glyph pulls them to the digits,
    // the two forces fight, and the mark never resolves.
    float drive = (1.0 - uGlyph) * (1.0 - amb) * (1.0 - uTerrain);
    vec3 force = vec3(0.0);
    force.xy += -2.0 * sP * gP * (1.0 - uDimension) * drive;
    force    += -2.0 * sV * gV * uDimension * drive;

    /* On the plate the grains are held in a slab, not pressed onto a pane.
       A pane has no depth to fly through: every grain sits at the same
       distance from the lens, nothing passes close to it, and the chapter can
       only ever be looked *at*. Giving the figure a thickness costs nothing —
       the nodal pattern lives in x and y — and buys the near-field the dive
       is made of. uThick is the slab's half-depth, in field units. */
    float slab = mix(uThick, 1.9, amb);
    float over = pos.z - clamp(pos.z, -slab, slab);
    force.z += -over * 14.0 * (1.0 - uDimension) * (1.0 - amb * 0.85) * (1.0 - uTerrain);

    /* The range. Grains fall onto the surface rather than being pressed flat,
       and are pushed outward in x and y as they land so the crests carry as
       much dust as the valleys — settle them straight down and a heightfield
       collects everything in its hollows. */
    float ht = terrainAt(pos.xy);
    float toSurface = ht - pos.z;
    force.z += toSurface * 11.0 * uTerrain * (1.0 - amb);
    vec2 slope = vec2(terrainAt(pos.xy + vec2(0.035, 0.0)) - ht,
                      terrainAt(pos.xy + vec2(0.0, 0.035)) - ht) / 0.035;
    force.xy += slope * 0.22 * uTerrain * (1.0 - amb);

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

    /* --- soft containment ---
       The atmosphere is held in a far larger shell than the figure, and drifts
       inside it rather than being pulled anywhere. */
    float cage = mix(1.9, 3.0, amb);
    float r = length(pos);
    if (r > cage) pos -= normalize(pos) * (r - cage) * 0.6;

    pos += (hash3(uv * 2.17 + fract(uTime * 0.11)) - 0.5) * amb * 0.035 * uDt;

    /* --- how settled is this grain? --- */
    float s = mix(abs(sP), abs(sV), uDimension);
    float lock = 1.0 - smoothstep(0.0, uLockWidth, s);
    // on the range, a grain is settled when it is lying on the ground
    lock = mix(lock, 1.0 - smoothstep(0.0, 0.22, abs(pos.z - ht)), uTerrain);
    // with the plate silent, |S| at a grain's position is meaningless — the
    // struck mark is settled by definition, so light all of it
    lock = mix(lock, 1.0, uGlyph);
    lock *= 1.0 - uScatter;
    // atmosphere never settles; it is what the figure is suspended in
    lock *= 1.0 - amb * 0.80;

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
  uniform float uHeroMaxPx;   // heroes are allowed to be far larger than dust

  /* focus */
  uniform float uFocus;
  uniform float uFocusRange;
  uniform float uBokeh;

  /* the field the grain is sitting on */
  uniform vec2  uMode;
  uniform vec3  uGyroid;
  uniform float uDimension;
  uniform vec3  uLightDir;

  uniform vec3  uPointer;   // the hand, in field space
  uniform float uPointerLit; // 0 when the hand has left the plate

  /* the grain's own geometry, morphed by the scroll */
  uniform float uElong;
  uniform float uTumble;
  uniform float uAlign;   // 0 every grain at its own angle · 1 all on the flow
  uniform float uSpin;    // idle rotation: the rate this beat's form turns at
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
  varying float vPulse;   // how far out on the figure this grain sits
  varying float vPx;      // the sprite's *sharp* size on screen, in pixels
  varying float vAmb;     // 1 if this grain is atmosphere rather than figure
  varying float vHero;    // 1 if this grain is drawn large, as an object
  varying float vNear;    // 1 under the pointer, falling off with distance
  varying float vFres;    // edge-on facets catch a halo the flat ones do not
  varying float vIris;    // thin-film phase: what colour this facet is held at

  /* a world-space direction, as the unit screen direction it projects to at
     this grain's own depth */
  vec2 screenDir(vec3 dir, vec4 mv) {
    vec3 dv = (modelViewMatrix * vec4(dir, 0.0)).xyz;
    vec2 s = vec2(dv.x - mv.x * dv.z / mv.z, dv.y - mv.y * dv.z / mv.z);
    s = vec2(projectionMatrix[0][0] * s.x, projectionMatrix[1][1] * s.y);
    float l = length(s);
    return l > 1e-6 ? s / l : vec2(1.0, 0.0);
  }

  void main() {
    vec4 state = texture2D(uPosition, aRef);
    vec3 pos = state.xyz;
    vLock = state.w;
    vSeed = aSeed;
    vAmb = ambientOf(aRef);
    vHero = (1.0 - vAmb) * heroOf(aRef);

    /* The hand does not only push the dust about — it wakes it. Grains near
       the pointer take a little more light, which turns a drag through the
       field from a physics demonstration into something that answers. */
    vNear = uPointerLit * exp(-dot(pos - uPointer, pos - uPointer) * 5.5);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float depth = max(-mv.z, 0.001);
    vDepth = depth;

    // distance out across the plate, or through the volume: the phase at which
    // a pulse leaving the centre reaches this grain
    vPulse = mix(length(pos.xy), length(pos), uDimension);

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

    /* Two terms the field was missing, and between them most of what makes a
       small bright thing read as a material rather than as a lit dot.

       Fresnel: a facet turned edge-on to the eye returns far more light than
       one facing it. Without it every grain is equally bright whatever angle
       it is held at, which is why they read as specks — real particles pick
       out their silhouettes against the dark as they turn.

       And a thin-film phase. Interference colour depends on the angle a film
       is viewed at, which is what makes oil, mica and anodised metal shift
       hue as they move. Driving it from the same angle gives the grains a
       colour that belongs to their orientation rather than to a palette, so a
       turning field shimmers instead of merely flickering. */
    vFres = pow(1.0 - facing, 3.2);
    vIris = fract(facing * 1.35 + aSeed * 0.21);

    /* --- the flake's silhouette ---
       Widest across the direction perpendicular to both its normal and the
       eye; foreshortened to a sliver as it turns edge-on. That ellipse is
       the shape, so the geometry itself carries the depth. --- */
    vec3 t = cross(n, viewDir);
    float tlen = length(t);
    t = tlen > 1e-4 ? t / tlen : vec3(1.0, 0.0, 0.0);
    vec2 axis = screenDir(t, mv);

    /* --- the flow the grain is riding ---
       A nodal line on the plate runs perpendicular to the field's gradient,
       and the same construction inside the volume gives a direction lying in
       the gyroid's surface. Pointing the form along it is what turns a cloud
       of unrelated motes into a shoal that is plainly going somewhere — so
       the blades of the sweep line up with the ridges they are piling onto
       instead of pointing anywhere at all. */
    vec3 flow = mix(vec3(-gp.y, gp.x, 0.0), cross(gv, vec3(0.0, 0.0, 1.0)), uDimension);
    float flen = length(flow);
    if (flen > 1e-4 && uAlign > 0.001) {
      vec2 af = screenDir(flow / flen, mv);
      // the form's axis is a line, not an arrow: resolve the 180° ambiguity
      // toward the grain's own angle so the blend cannot cancel to nothing
      af *= dot(af, axis) < 0.0 ? -1.0 : 1.0;
      axis = normalize(mix(axis, af, uAlign) + 1e-6);
    }

    // No two flakes settle at quite the same angle — except where the field is
    // driving hard enough to line them all up, and a shaken plate sets them
    // tumbling at their own rates again.
    /* Each beat's form turns at its own rate — a gimbal spins because that is
       what a gimbal is for, a seal does not because mass sits still. Spread
       over the seed so the cloud never turns as one body. */
    float wob = (aSeed - 0.5) * 0.7 * (1.0 - uAlign * 0.85)
              + uSpin * uTime * (0.7 + aSeed * 0.6)
              + uTumble * (aSeed - 0.5) * 9.0
              + uTumble * uTime * (0.6 + aSeed * 1.8);
    float cw = cos(wob), sw = sin(wob);
    vAxis = vec2(axis.x * cw - axis.y * sw, axis.x * sw + axis.y * cw);

    vSquash = clamp(facing, 0.16, 1.0);

    /* --- true projected size of a sphere of this radius --- */
    /* Atmosphere is drawn as motes several times the size of a figure grain.
       This is the quality a dive has that a wide shot does not: something
       large and unresolved passing close to the lens, against small sharp
       structure behind it. Matching the figure's grain size would have put
       the same speck everywhere and read as noise rather than as air. */
    float radius = uGrainRadius
                 * mix(1.0, uSettledGain, vLock)
                 * (0.72 + aSeed * 0.56)
                 * mix(1.0, 2.1 + aSeed * 1.1, vAmb)
                 * mix(1.0, 3.4 + aSeed * 1.8, vHero);

    float px = 2.0 * radius * uProjScale / depth;

    // an elongated grain needs a longer sprite to live in
    px *= mix(1.0, sqrt(max(uElong, 1.0)), 0.6);

    /* The size the grain would be drawn at if it were in focus. Defocus makes
       the sprite larger without making the grain any more resolved, so the
       detail level has to be read here, before the circle of confusion
       inflates it — otherwise a distant out-of-focus speck is mistaken for a
       close-up object and drawn with an inside it cannot possibly show. */
    vPx = clamp(px, uMinPx, mix(uMaxPx, uHeroMaxPx, vHero));

    float coc = clamp(abs(depth - uFocus) / uFocusRange, 0.0, 1.0);
    coc *= coc;
    vBlur = coc;
    px *= 1.0 + coc * uBokeh;

    gl_PointSize = clamp(px, uMinPx, mix(uMaxPx, uHeroMaxPx, vHero));
    gl_Position = projectionMatrix * mv;
  }
`;

/* The form library, shared by both passes: the glow pass and the solid pass
   must draw the same seven shapes, and two copies would drift apart. */
const FORMS = /* glsl */ `
  /* ------------------------------------------------------------------
     The form library.

     Seven silhouettes, but not seven unrelated objects: one thing becoming
     something, so that the shape alone carries the story even with the words
     covered up.

       0 FILAMENT  an inert thread with a dark node. Nothing has been asked
                   of it. There is no structure here, only the possibility
                   of some.
       1 TRIAD     the thread throws out three struts and holds a hub. The
                   first note has arrived and the grain has STRUCTURE.
       2 LANCE     the struts sweep back into barbs and the body draws to a
                   point. It now has a DIRECTION, which is why the sweep is
                   where the field starts to fly.
       3 GIMBAL    the barbs curve round and close into a ring with a bar
                   across it. It has gained an AXIS: a thing that can be
                   aimed, and therefore an instrument.
       4 CAGE      the ring opens into an eight-sided cell braced on an inner
                   diamond. It has gained VOLUME, which is the beat where the
                   field itself leaves the plate and closes into a surface.
       5 SEAL      the cage compacts into a slab with two struck slots. It
                   has gained MASS — it is metal now, and it has been hit.
       6 SIGIL     the slab opens into an eight-pointed mark. It has gained
                   an IDENTITY, and the dust is spelling the house it came
                   from one grain at a time.

     Every form returns two distances: the outline, and the inner structure
     that lights as the grain locks. That second channel is what stops these
     reading as stamped shapes — each one has something going on inside it,
     and what is going on is the part that carries over to the next beat.

     They are signed distance fields for one reason: mixing two fields gives
     a real in-between body, so scrubbing between two beats grows one machine
     into the next instead of cross-fading two pictures. The lineage is what
     makes that mixing read as a story rather than as a morph.
     ------------------------------------------------------------------ */

  float sdBox(vec2 p, vec2 b) {
    vec2 q = abs(p) - b;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0));
  }

  /* a regular polygon, by folding the plane into one of its wedges */
  float sdPoly(vec2 p, float sides, float r) {
    float a = atan(p.y, p.x);
    float seg = TAU / sides;
    return cos(floor(0.5 + a / seg) * seg - a) * length(p) - r;
  }

  /* a segment from the origin out along +x, of length l and radius w */
  float sdBar(vec2 p, float l, float w) {
    p.x -= clamp(p.x, 0.0, l);
    return length(p) - w;
  }

  /* fold the plane into one wedge of an n-fold rotation */
  vec2 foldN(vec2 p, float n) {
    float seg = TAU / n;
    float a = mod(atan(p.y, p.x) + seg * 0.5, seg) - seg * 0.5;
    return vec2(cos(a), sin(a)) * length(p);
  }

  /* 0 — FILAMENT. Inert. A thread with a node in it and nothing else: the
     grain before anything has been asked of it. */
  vec2 fFilament(vec2 p, vec2 an) {
    float thread = sdBox(p, vec2(0.022, 0.250));
    // the node travels the thread: the one moving part of a dormant object
    float node = length(p - vec2(0.0, an.x * 0.170)) - 0.052;
    return vec2(min(thread, node), node);
  }

  /* 1 — TRIAD. The first note lands and the thread throws out three struts
     onto a hub. Structure, where a moment ago there was a line. */
  vec2 fTriad(vec2 p, vec2 an) {
    vec2 q = foldN(p, 3.0);
    // the struts reach and draw back, feeling for the note
    float strut = sdBar(q, 0.215 + an.x * 0.055, 0.025);
    // the hub is turned to sit between the struts, so the two read as one
    // assembly rather than as a triangle with spokes stuck through it
    float hub   = sdPoly(-p, 3.0, 0.062);
    return vec2(min(strut, hub), sdPoly(-p, 3.0, 0.032));
  }

  /* 2 — LANCE. The struts sweep back into barbs and the body draws forward
     to a point. The first form with a direction, and the beat where the
     field starts to fly. */
  vec2 fLance(vec2 p, vec2 an) {
    // the shaft, running back from the point
    float shaft = sdBox(p - vec2(0.02, 0.0), vec2(0.190, 0.026));
    // the head: two leading edges folded about the axis
    float head  = max((p.x - 0.300) * 0.470 + abs(p.y) * 0.883,
                      -(p.x - 0.080));
    // barbs swept back off the shoulders
    // the barbs sweep as it flies, the way a control surface trims
    float sw = 0.82 + an.y * 0.10;
    float sv = 0.57 - an.y * 0.10;
    vec2  b = vec2(p.x + 0.055, abs(p.y) - 0.020);
    float barb = sdBar(vec2(-b.x * sw + b.y * sv,
                             b.x * sv + b.y * sw), 0.150 + an.x * 0.040, 0.022);
    return vec2(min(min(shaft, head), barb),
                sdBox(p - vec2(0.02, 0.0), vec2(0.130, 0.009)));
  }

  /* 3 — GIMBAL. The barbs curve round and close: a ring with a bar across it
     and two lugs on the axis. The grain can now be aimed. */
  vec2 fGimbal(vec2 p, vec2 an) {
    float ring = abs(length(p) - 0.230) - 0.030;
    float lugs = sdBox(vec2(abs(p.x) - 0.230, p.y), vec2(0.040, 0.062));
    /* The bar turns inside the ring rather than with it. A gimbal whose
       every part moves together is a badge; a gimbal with one part running
       against the rest is a mechanism, and that difference is most of what
       makes the beat read as an instrument. */
    vec2 r = vec2(p.x * an.y - p.y * an.x, p.x * an.x + p.y * an.y);
    float bar = sdBox(r, vec2(0.230, 0.024));
    return vec2(min(min(ring, bar), lugs), sdBox(r, vec2(0.058, 0.024)));
  }

  /* 4 — CAGE. The ring opens out into an eight-sided cell braced on an inner
     diamond — volume, at the beat where the field leaves the plate. */
  vec2 fCage(vec2 p, vec2 an) {
    /* Drawn with as few separate edges as the shape can carry. Every edge in
       a form is a rim highlight, and this is the beat where the camera is
       inside the field with the grains at their largest — a wireframe here
       puts a dozen highlights on every one of a hundred thousand cells and
       the gyroid disappears into its own glow. The brace bars earn their
       edges; the core is solid rather than outlined. */
    float shell = abs(sdPoly(p, 8.0, 0.248)) - 0.030;
    // the core turns inside the shell; the bracing works in and out with it
    vec2  c = vec2(p.x * an.y - p.y * an.x, p.x * an.x + p.y * an.y);
    float core  = sdPoly(c, 4.0, 0.100);
    vec2  q = foldN(p, 4.0);
    float brace = sdBar(vec2(q.x - 0.086 - an.x * 0.022, q.y), 0.140, 0.017);
    return vec2(min(min(shell, core), brace), sdPoly(c, 4.0, 0.052));
  }

  /* 5 — SEAL. The cage compacts into a slab and takes two struck slots. Mass:
     it is metal now, and it has been hit. */
  vec2 fSeal(vec2 p, vec2 an) {
    float slab = sdBox(p, vec2(0.255, 0.140));
    // knock the corners off: a struck seal, not a box
    slab = max(slab, (abs(p.x) + abs(p.y)) * 0.7071 - 0.252);
    float slots = min(sdBox(p - vec2(0.0,  0.060), vec2(0.145, 0.019)),
                      sdBox(p - vec2(0.0, -0.060), vec2(0.145, 0.019)));
    // a head tracks across the struck face, reading it
    float head = sdBox(p - vec2(an.x * 0.145, 0.0), vec2(0.016, 0.105));
    return vec2(slab, min(slots, head));
  }

  /* 6 — SIGIL. The slab opens into an eight-pointed mark on a diamond core.
     Identity: the last thing the dust becomes before it is only the word. */
  vec2 fSigil(vec2 p, vec2 an) {
    vec2  q = foldN(p, 4.0);
    // the two sets of rays breathe against each other, so the mark is held
    // open by something rather than merely drawn
    float ray  = sdBar(q, 0.245 + an.x * 0.035, 0.020);
    vec2  r = foldN(vec2(p.x + p.y, p.y - p.x) * 0.7071, 4.0);
    float ray2 = sdBar(r, 0.185 - an.x * 0.035, 0.014);
    float core = abs(sdPoly(vec2(p.y, p.x), 4.0, 0.092)) - 0.018;
    return vec2(min(min(ray, ray2), core), sdPoly(vec2(p.y, p.x), 4.0, 0.048));
  }

  /* The phase argument is this grain's animation clock as a unit vector:
     an.x reads as a
     stroke, an.y as the cosine that a rotation needs. Passing it in rather
     than reading uTime inside each form keeps every moving part of the field
     on one clock, and lets the whole set be frozen by scaling it to zero —
     which is what holds the struck mark still at the end. */
  vec2 form(float id, vec2 p, vec2 an) {
    if (id < 0.5) return fFilament(p, an);
    if (id < 1.5) return fTriad(p, an);
    if (id < 2.5) return fLance(p, an);
    if (id < 3.5) return fGimbal(p, an);
    if (id < 4.5) return fCage(p, an);
    if (id < 5.5) return fSeal(p, an);
    return fSigil(p, an);
  }

`;

const RENDER_FRAG = /* glsl */ `
  precision highp float;

  #define TAU 6.2831853071

  uniform vec3  uCold;      // drifting, unresolved
  uniform vec3  uHot;       // settled on a node
  uniform vec3  uHaze;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uBokeh;
  uniform float uHazeDensity;
  uniform float uHazeNear;
  uniform float uTime;

  /* the grain's own geometry — see the form library below */
  uniform float uFormA;     // the beat the scroll is leaving
  uniform float uFormB;     // the beat it is arriving at
  uniform float uFormMix;   // where between them it currently is
  uniform float uElong;     // 1 equant · >1 drawn out along its axis
  uniform float uHollow;    // 1 drawn outline · 0 solid body
  uniform float uFacet;     // how hard-edged the form reads
  uniform float uCore;      // how brightly the inner structure burns
  uniform float uScan;      // the sweep of light that says it is running
  uniform float uShatter;   // a shaken plate chips the edges off
  uniform float uIris;      // how much thin-film colour the material carries
  uniform float uMorphSpread; // how far apart grains cross from one form to the next
  uniform float uMorphFlare;  // how hard a grain lights at the moment it crosses
  uniform float uSolidPx;     // above this size a grain is drawn by the solid pass
  uniform float uFormFade;  // 1 the grain is an object · 0 it is only a grain

  varying float vLock;
  varying float vSeed;
  varying float vBlur;
  varying float vShade;
  varying float vGlint;
  varying float vDepth;
  varying vec2  vAxis;
  varying float vSquash;
  varying float vPulse;
  varying float vPx;
  varying float vAmb;
  varying float vHero;
  varying float vNear;
  varying float vFres;
  varying float vIris;

  ${FORMS}

  void main() {
    vec2 q = gl_PointCoord - 0.5;

    // into the grain's own frame: aligned to its axis, foreshortened across
    // the other as it turns edge-on, stretched by the beat's elongation
    vec2 p = vec2(q.x * vAxis.x + q.y * vAxis.y,
                 -q.x * vAxis.y + q.y * vAxis.x);
    p.y /= max(vSquash, 0.16);
    p.x /= max(uElong, 0.001);

    // A settled grain breathes. Nothing here is a still image of a machine;
    // it is idling, and the eye reads that difference immediately.
    float breath = 1.0 + 0.055 * sin(uTime * 1.7 + vSeed * TAU) * vLock * uCore;
    p /= breath;

    /* Every contraption has moving parts of its own, on a per-grain phase so
       the field is never a thousand copies of one animation. Scaled by
       uFormFade, so as the mark is struck the mechanisms come to rest. */
    float ph = uTime * 1.15 + vSeed * TAU;
    vec2  an = vec2(sin(ph), cos(ph)) * uFormFade;

    /* A shape change should be something the reader watches happen.
    
       Every grain used to cross from one form to the next on the same frame,
       which makes the field blink: one moment a hundred thousand lances, the
       next a hundred thousand gimbals, with the in-between too brief and too
       uniform to register as anything. Offsetting each grain's crossing by how
       far out it sits turns the change into a wave that leaves the centre and
       travels the figure, so the two forms are on screen together for most of
       the transition and the reader can see one becoming the other. */
    float lead = clamp(vPulse * 0.52, 0.0, 1.0) * 0.66 + vSeed * 0.34;
    float m = clamp(uFormMix * (1.0 + uMorphSpread) - lead * uMorphSpread, 0.0, 1.0);
    m = m * m * (3.0 - 2.0 * m);

    // and each grain lights as it goes over, which is what makes the wave
    // visible as a wave rather than inferred from the shapes it leaves behind
    float crossing = 1.0 - abs(m * 2.0 - 1.0);
    crossing = crossing * crossing * uMorphFlare * vLock;

    vec2 f = mix(form(uFormA, p, an), form(uFormB, p, an), m);
    float d = f.x;
    float inner = f.y;

    // scrubbing hard chips the edges off — the form visibly takes damage
    d += uShatter * 0.05 * sin(atan(p.y + 1e-6, p.x + 1e-6) * 9.0 + vSeed * 137.0);

    if (d > 0.26) discard;

    float edge = fwidth(d) + 0.004;
    float fill = smoothstep(edge, -edge, d);
    float rim  = exp(-abs(d) * (62.0 * uFacet));

    // hollow draws the form as an outline; solid fills it in. Early on the
    // grains are diagrams of themselves, and they acquire a body as they lock.
    float body = mix(fill, rim, uHollow);

    // the inner structure lights as the grain settles
    float ce = fwidth(inner) + 0.004;
    float core = smoothstep(ce, -ce, inner) * uCore * (0.25 + vLock * 0.90);

    /* A scan sweep travels the long axis of each form — but its phase comes
       from where the grain sits on the figure, not from the grain itself. The
       light therefore crosses the whole plate as a ring leaving the centre,
       and the dust reads as one body being driven rather than ten thousand
       independent sparks blinking out of step. */
    float phase = fract(uTime * 0.30 - vPulse * 0.55 + vSeed * 0.12);
    float sb = (p.x + 0.36 - phase * 0.72) * 16.0;
    float ring = exp(-sb * sb);
    float scan = ring * fill * uScan * vLock;

    // the core takes the pulse as it goes past, so the thing is visibly
    // running on something rather than merely lit
    core *= 0.74 + 0.52 * ring;

    /* Everything here is additively blended, so a term that looks right on one
       grain multiplies where a thousand of them crowd onto a node. The inner
       structure is weighted to read on a single grain held up to the light,
       not to survive being stacked — the nodal lines are the brightest thing
       in the frame already. */
    /* --- level of detail, in two stages ---
       A silhouette and an interior are not equally affordable. Shaping a
       grain's outline only moves its ink around, so the form can start
       showing as soon as the sprite is a few pixels across. A lit core or a
       scan line *adds* light, and on a figure carrying a hundred thousand
       additively blended grains that addition stacks until the pattern the
       grains are tracing closes into a solid mass — so the interior has to
       wait until the grain is genuinely big enough, and in focus enough, to
       have a visible inside at all. Getting this backwards fills the
       counters of the closing mark and turns "999" into a smudge.

       The silhouette is not free either: a rim is an edge highlight, and on
       a thin feature at one pixel that highlight is most of the grain, so a
       shaped speck still emits more than the round one it replaced. Both
       stages therefore wait for real pixels to work with. */
    /* As the struck mark forms, the grain stops being the subject. What the
       reader has to see at the end is the figure the dust is spelling, and a
       hundred thousand little machines — however carefully weighted — put
       more light between the digits than three 9s can survive. So the forms
       hand the frame back: by the time the mark is fully struck each grain is
       a plain speck again, which is exactly what the closing shot wants. */
    // atmosphere is never a contraption: it is out of focus by definition
    /* Handed over. A grain the solid pass has drawn as an object must not
       also be drawn here, or the glow lands on top of the hard edge and
       undoes it — which is the whole reason the solid pass exists. */
    if (vHero >= 0.5 && vPx >= uSolidPx && vLock >= 0.42 && vBlur <= 0.55 && uFormFade >= 0.5) discard;

    float formLod   = smoothstep(1.6, 5.0, vPx) * uFormFade * (1.0 - vAmb);
    float innerLod  = smoothstep(4.0, 9.5, vPx) * (1.0 - vBlur) * uFormFade;
    // a third tier, for grains close enough that machining would be visible
    float detailLod = smoothstep(9.0, 20.0, vPx) * (1.0 - vBlur) * uFormFade;

    /* --- the grain as a solid, not a silhouette ---

       Every grain here has been a flat filled outline: the distance field was
       used as a stencil and thrown away. But an SDF carries everything needed
       to light a solid. Its gradient is the direction the surface faces, and
       how far inside the sample sits says whether it is on the chamfer or on
       the face. Reconstructing a normal from those two and lighting it is the
       difference between a shape cut out of paper and an object with a top, a
       bevelled edge, and a side that catches the lamp as it turns.

       The bevel is held to a couple of pixels, so the edge stays a hard line
       rather than a soft shoulder — this is a machined part, and the whole
       point of the chamfer is the bright line it throws where it meets the
       face. Below a few pixels the derivatives are meaningless, so the
       shading fades out with formLod and the grain goes back to being flat,
       which at that size is all it could honestly be anyway. */
    vec2  grad = vec2(dFdx(d), dFdy(d));
    float glen = length(grad);
    vec2  gdir = glen > 1e-7 ? grad / glen : vec2(1.0, 0.0);

    /* A wide chamfer, not a hairline one. The first pass gave the forms a
       two-pixel edge, which is a crisp border but leaves the whole face
       flat-lit and the object reads as a lit sticker. Turning a fifth of the
       half-width into chamfer gives the normal somewhere to swing, so the
       shape has a bright side and a dark side and the eye gets the tonal
       range it needs to call it solid. */
    float bevel = max(fwidth(d) * 3.4, 0.058);
    float face  = clamp(-d / bevel, 0.0, 1.0);        // 0 on the rim, 1 on the face
    float turn  = face * 1.5707963;
    vec3  N = normalize(vec3(-gdir * cos(turn), sin(turn) + 0.002));

    vec3  L = normalize(vec3(-0.46, 0.60, 0.66));
    float lam  = max(dot(N, L), 0.0);
    vec3  H    = normalize(L + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(N, H), 0.0), 58.0);

    // the lit chamfer: a bright line exactly where the edge turns over
    float chamfer = (1.0 - face) * face * 4.0;

    float solid = mix(1.0, 0.20 + 1.18 * lam, formLod);

    float shell = body * (0.55 + vLock * 0.55) * solid
                + rim * 0.35 * vLock
                + (spec * 0.55 + chamfer * 0.22) * formLod * (0.30 + vLock * 0.80);
    float shape = shell + (core * 0.70 + scan * 0.45) * innerLod;

    /* Panel lines. Contours of the form's own distance field, scored into the
       body — so every form is panelled by its own silhouette without a single
       line being drawn per shape, and the panelling of a lance follows the
       lance. They subtract rather than add, which is what makes them read as
       machining cut into a surface instead of wires laid over one, and they
       cost no light on a figure that is already additively blended. Held back
       until the grain is close enough that they would be more than noise —
       which, now the whole piece is flown, is most of it. */
    float band  = abs(fract(d * 26.0 + 0.5) - 0.5) / 26.0;
    float panel = 1.0 - smoothstep(0.0, 0.0055, band);
    shape -= panel * fill * 0.24 * detailLod;

    // diffraction spikes off the facets of the ones that have locked hard
    shape += crossing * fill * 0.22;

    shape += (exp(-abs(p.y) * 52.0) + exp(-abs(p.x) * 52.0))
           * exp(-dot(p, p) * 5.0) * vLock * 0.22;

    /* The low-resolution grain has to stay *compact*, not merely dim. A soft
       falloff spreads the same light over the whole sprite, and across a
       dense figure that spread is what closes the counters of the digits —
       the mark went to a smudge on a profile that was correctly dimmed but
       twice as wide. So a far grain is drawn as its own hard silhouette and
       nothing else: no rim, no interior, and no fallback disc, which would
       have ignored the foreshortening every other grain is subject to and
       quietly handed the distant ones more coverage than they had earned.

       Energy matters as much as width: the profile this replaced carried an
       edge highlight as well as a body, so dropping to the bare silhouette at
       0.62 halved the light and the mark read as haze rather than as three
       solid digits. The silhouette therefore carries the whole of the old
       peak, as fill alone — a rim term would put most of that light on the
       thinnest feature under the sample, which is the stacking problem again. */
    float lowRes = fill * 1.30;
    shape = mix(lowRes, shape, formLod);

    /* A mote is a soft body with no edge — the defocus of something too close
       to resolve. Weighted well below a figure grain so that a fifth of the
       field can fill the frame without ever competing with the figure for
       attention: it is what the figure hangs in, not part of it. */
    shape = mix(shape, exp(-dot(q, q) * 7.0) * 0.11, vAmb);

    /* Defocus takes the aperture's shape rather than dissolving to a smudge —
       and never takes the whole grain. Blending all the way to the soft
       profile deleted the form outright the moment it left the focal plane,
       so a contraption the reader had just been shown would vanish into a
       blob for the rest of the shot. Capped, the shape survives its own
       defocus. */
    float soft = smoothstep(0.26, -0.18, d) * (0.72 + 0.5 * smoothstep(-0.02, 0.16, d));
    shape = mix(shape, soft, vBlur * 0.55);

    vec3 col = mix(uCold, uHot, smoothstep(0.15, 0.95, vLock));
    col *= vShade;
    col *= 0.72 + vLock * uGlow;
    col += uHot * vGlint * 0.40;

    /* The edge light, tinted by the film. Kept narrow in hue — a sixth of the
       wheel either side of the hot colour, not a full rainbow — because the
       point is a material that answers to how it is turned, not a soap
       bubble. Weighted by rim so it lands on the silhouette, which is where
       interference actually shows. */
    vec3 film = 0.5 + 0.5 * cos(6.2831853 * (vIris + vec3(0.0, 0.21, 0.42)));
    col += mix(uHot, film, 0.62) * rim * vFres * uIris * (0.35 + vLock * 0.55);
    col += mix(uCold, uHot, vLock) * vFres * 0.12;
    col += uHot * crossing * 0.60;
    // a struck edge returns the lamp, not the body colour
    col += mix(uHot, vec3(1.0), 0.55) * spec * formLod * (0.25 + vLock * 0.75) * 0.5;
    // the core and the scan line burn hotter than the body they sit in
    col += uHot * (core * 0.30 + scan * 0.40) * innerLod;
    // the hand's own light, on the body rather than the outline, so it reads
    // as the dust catching a lamp rather than as a selection halo
    col += uHot * vNear * 0.55;
    shape += vNear * fill * 0.30;

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

/* ------------------------------------------------------------------
   The solid pass.

   Everything in this field is additively blended, and additive blending
   cannot draw a dark side. A bevel's whole claim to being three-dimensional
   is that one face is lit and the other is not, and under addition the unlit
   face is simply filled in by whatever grain lies behind it. Nothing occludes
   anything either, because the pass writes no depth. Shading a grain as a
   solid and then compositing it additively therefore produces a correct
   calculation of a thing you cannot see: it reads as a glowing smudge no
   matter how carefully the normal is reconstructed.

   So the grains large enough and close enough to be read as objects are drawn
   first, opaque, writing depth. They occlude each other and everything behind
   them, they carry a genuinely dark side, and their silhouette is a hard
   cutout rather than a falloff. The rest of the field — the small, the
   distant, the atmosphere, the unsettled — stays exactly as it was, and is
   depth-tested against the solids so it cannot wash over them.

   One field, drawn twice, each half in the mode that suits what it is.
   ------------------------------------------------------------------ */
const RENDER_FRAG_SOLID = /* glsl */ `
  precision highp float;

  #define TAU 6.2831853071

  uniform vec3  uCold;
  uniform vec3  uHot;
  uniform vec3  uHaze;
  uniform float uGlow;
  uniform float uHazeDensity;
  uniform float uHazeNear;
  uniform float uTime;
  uniform float uSolidPx;    // the size at which a grain becomes an object
  uniform float uIris;

  uniform float uFormA;
  uniform float uFormB;
  uniform float uFormMix;
  uniform float uElong;
  uniform float uFacet;
  uniform float uCore;
  uniform float uScan;
  uniform float uShatter;
  uniform float uFormFade;
  uniform float uMorphSpread;

  varying float vLock;
  varying float vSeed;
  varying float vBlur;
  varying float vShade;
  varying float vGlint;
  varying float vDepth;
  varying vec2  vAxis;
  varying float vSquash;
  varying float vPulse;
  varying float vPx;
  varying float vAmb;
  varying float vHero;
  varying float vNear;
  varying float vFres;
  varying float vIris;

  ${FORMS}

  void main() {
    /* Only the grains that have earned it. A solid needs enough pixels for a
       bevel to exist in, and it has to be settled — a grain still drifting is
       not an object yet, it is dust, and dust belongs in the glow pass. */
    if (vHero < 0.5 || vPx < uSolidPx || vLock < 0.42 || vBlur > 0.55) discard;
    if (uFormFade < 0.5) discard;

    vec2 q = gl_PointCoord - 0.5;
    vec2 p = vec2(q.x * vAxis.x + q.y * vAxis.y,
                 -q.x * vAxis.y + q.y * vAxis.x);
    p.y /= max(vSquash, 0.16);
    p.x /= max(uElong, 0.001);

    float ph = uTime * 1.15 + vSeed * TAU;
    vec2  an = vec2(sin(ph), cos(ph)) * uFormFade;

    float lead = clamp(vPulse * 0.52, 0.0, 1.0) * 0.66 + vSeed * 0.34;
    float m = clamp(uFormMix * (1.0 + uMorphSpread) - lead * uMorphSpread, 0.0, 1.0);
    m = m * m * (3.0 - 2.0 * m);

    vec2  f = mix(form(uFormA, p, an), form(uFormB, p, an), m);
    float d = f.x;
    float inner = f.y;
    d += uShatter * 0.05 * sin(atan(p.y + 1e-6, p.x + 1e-6) * 9.0 + vSeed * 137.0);

    // a hard cutout: this is the border, and it is a decision, not a gradient
    float aa = fwidth(d);
    if (d > aa * 0.5) discard;

    /* The same bevel as the glow pass, but here it can actually be seen,
       because nothing is adding light back into the dark side of it. */
    vec2  grad = vec2(dFdx(d), dFdy(d));
    float glen = length(grad);
    vec2  gdir = glen > 1e-7 ? grad / glen : vec2(1.0, 0.0);

    float bevel = max(aa * 3.4, 0.058);
    float face  = clamp(-d / bevel, 0.0, 1.0);
    float turn  = face * 1.5707963;
    vec3  N = normalize(vec3(-gdir * cos(turn), sin(turn) + 0.002));

    vec3  L  = normalize(vec3(-0.46, 0.60, 0.66));
    vec3  L2 = normalize(vec3(0.55, -0.35, 0.42));   // a cool fill, from below
    float lam  = max(dot(N, L), 0.0);
    float fill = max(dot(N, L2), 0.0);
    vec3  H    = normalize(L + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(N, H), 0.0), 58.0);

    /* The palette's hot end is a cream — nearly white, which is right for a
       grain of light and wrong for a solid, because a solid lit with it is a
       snowflake. Pushing saturation back up before shading returns the metal:
       the cream reads as gold and the slate as blue, which is the contrast
       the field is built on, restated at object scale. */
    vec3 base = mix(uCold, uHot, smoothstep(0.15, 0.95, vLock)) * vShade;
    float lum = dot(base, vec3(0.299, 0.587, 0.114));
    base = mix(vec3(lum), base, 1.55);

    vec3 col = base * (0.16 + 0.92 * lam)          // key
             + mix(uCold, base, 0.5) * fill * 0.30 // fill, keeps the dark side readable
             /* A metal highlight keeps most of the body's colour. Mixing it
                six tenths of the way to white and then weighting it above one
                turned every hero into a white snowflake — bright, detailed,
                and made of the wrong material entirely. */
             + mix(uHot, vec3(1.0), 0.32) * spec * (0.22 + vLock * 0.42);

    // the thin film still rides the edge
    vec3 film = 0.5 + 0.5 * cos(TAU * (vIris + vec3(0.0, 0.21, 0.42)));
    col += mix(uHot, film, 0.62) * vFres * uIris * 0.22 * (1.0 - face);

    // interior structure, cut into the solid rather than glowing over it
    float ce = fwidth(inner);
    float core = smoothstep(ce, -ce, inner);
    col = mix(col, col * 0.42, core * 0.55);
    col += uHot * core * uCore * 0.30;

    float band  = abs(fract(d * 26.0 + 0.5) - 0.5) / 26.0;
    float panel = 1.0 - smoothstep(0.0, 0.0055, band);
    col *= 1.0 - panel * 0.42;

    col += uHot * vNear * 0.45;
    col *= 0.75 + vLock * uGlow * 0.55;

    float haze = 1.0 - exp(-max(vDepth - uHazeNear, 0.0) * uHazeDensity);
    col = mix(col, uHaze, haze * 0.62);

    gl_FragColor = vec4(col, 1.0);
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
    uThick:        { value: 0.02 },
    uTerrain:      { value: 0 },
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
    uHeroMaxPx:   { value: 150 },

    uFocus:       { value: 1200 },
    uFocusRange:  { value: 900 },
    // enough to separate near from far, not enough to erase a silhouette
    uBokeh:       { value: 1.5 },

    // shared with the simulation so shading always matches the physics
    uMode:        sim.uMode,
    uGyroid:      sim.uGyroid,
    uDimension:   sim.uDimension,
    uLightDir:    { value: new THREE.Vector3(-0.42, 0.68, 0.6) },
    uPointer:     sim.uPointer,
    uPointerLit:  { value: 0 },

    uCold:        { value: new THREE.Color('#5d7286') },
    uHot:         { value: new THREE.Color('#e7c274') },
    uHaze:        { value: new THREE.Color('#070a0f') },
    uOpacity:     { value: 1 },
    uGlow:        { value: 1.3 },

    // the grain's geometry: which two forms the scroll is between, and how
    // each of them is being drawn
    uFormA:       { value: 0 },
    uFormB:       { value: 0 },
    uFormMix:     { value: 0 },
    uElong:       { value: 1 },
    uHollow:      { value: 0.9 },
    uFacet:       { value: 0.5 },
    uCore:        { value: 0.15 },
    uScan:        { value: 0 },
    uShatter:     { value: 0 },
    uIris:        { value: 0.85 },
    uMorphSpread: { value: 0.62 },
    /* Where a grain stops being a speck of light and becomes an object. Low
       enough that the close field is genuinely solid, high enough that the
       plate chapters stay a glow — a figure made of ten thousand opaque chips
       is a mosaic, not a standing wave. */
    uSolidPx:     { value: 5.0 },
    uMorphFlare:  { value: 0.55 },
    uFormFade:    { value: 1 },
    uSpin:        { value: 0 },
    uAlign:       { value: 0 },
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
  points.renderOrder = 1;

  /* The solid pass shares the geometry and every uniform — it is the same
     field, drawn first and opaquely, so the objects in it write depth and the
     glow behind them is tested against it. */
  const solidMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: RENDER_VERT,
    fragmentShader: RENDER_FRAG_SOLID,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    blending: THREE.NoBlending,
  });

  const solid = new THREE.Points(geometry, solidMaterial);
  solid.scale.setScalar(scale);
  solid.frustumCulled = false;
  solid.renderOrder = 0;

  const _p = new THREE.Vector3();

  return {
    points,
    solid,
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
        uniforms.uPointerLit.value = 0;
        return;
      }
      _p.copy(worldPos).divideScalar(scale);
      sim.uPointer.value.copy(_p);
      sim.uPointerForce.value = force;
      uniforms.uPointerLit.value = 1;
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
      solidMaterial.dispose();
      targets.dispose();
    },
  };
}
