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
    float radius = uGrainRadius
                 * mix(1.0, uSettledGain, vLock)
                 * (0.72 + aSeed * 0.56);

    float px = 2.0 * radius * uProjScale / depth;

    // an elongated grain needs a longer sprite to live in
    px *= mix(1.0, sqrt(max(uElong, 1.0)), 0.6);

    /* The size the grain would be drawn at if it were in focus. Defocus makes
       the sprite larger without making the grain any more resolved, so the
       detail level has to be read here, before the circle of confusion
       inflates it — otherwise a distant out-of-focus speck is mistaken for a
       close-up object and drawn with an inside it cannot possibly show. */
    vPx = clamp(px, uMinPx, uMaxPx);

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
  vec2 fFilament(vec2 p) {
    float thread = sdBox(p, vec2(0.022, 0.250));
    return vec2(thread, length(p) - 0.052);
  }

  /* 1 — TRIAD. The first note lands and the thread throws out three struts
     onto a hub. Structure, where a moment ago there was a line. */
  vec2 fTriad(vec2 p) {
    vec2 q = foldN(p, 3.0);
    float strut = sdBar(q, 0.240, 0.025);
    // the hub is turned to sit between the struts, so the two read as one
    // assembly rather than as a triangle with spokes stuck through it
    float hub   = sdPoly(-p, 3.0, 0.062);
    return vec2(min(strut, hub), sdPoly(-p, 3.0, 0.032));
  }

  /* 2 — LANCE. The struts sweep back into barbs and the body draws forward
     to a point. The first form with a direction, and the beat where the
     field starts to fly. */
  vec2 fLance(vec2 p) {
    // the shaft, running back from the point
    float shaft = sdBox(p - vec2(0.02, 0.0), vec2(0.190, 0.026));
    // the head: two leading edges folded about the axis
    float head  = max((p.x - 0.300) * 0.470 + abs(p.y) * 0.883,
                      -(p.x - 0.080));
    // barbs swept back off the shoulders
    vec2  b = vec2(p.x + 0.055, abs(p.y) - 0.020);
    float barb = sdBar(vec2(-b.x * 0.82 + b.y * 0.57,
                             b.x * 0.57 + b.y * 0.82), 0.170, 0.022);
    return vec2(min(min(shaft, head), barb),
                sdBox(p - vec2(0.02, 0.0), vec2(0.130, 0.009)));
  }

  /* 3 — GIMBAL. The barbs curve round and close: a ring with a bar across it
     and two lugs on the axis. The grain can now be aimed. */
  vec2 fGimbal(vec2 p) {
    float ring = abs(length(p) - 0.230) - 0.030;
    float bar  = sdBox(p, vec2(0.230, 0.024));
    float lugs = sdBox(vec2(abs(p.x) - 0.230, p.y), vec2(0.040, 0.062));
    return vec2(min(min(ring, bar), lugs), sdBox(p, vec2(0.058, 0.024)));
  }

  /* 4 — CAGE. The ring opens out into an eight-sided cell braced on an inner
     diamond — volume, at the beat where the field leaves the plate. */
  vec2 fCage(vec2 p) {
    /* Drawn with as few separate edges as the shape can carry. Every edge in
       a form is a rim highlight, and this is the beat where the camera is
       inside the field with the grains at their largest — a wireframe here
       puts a dozen highlights on every one of a hundred thousand cells and
       the gyroid disappears into its own glow. The brace bars earn their
       edges; the core is solid rather than outlined. */
    float shell = abs(sdPoly(p, 8.0, 0.248)) - 0.030;
    float core  = sdPoly(vec2(p.y, p.x), 4.0, 0.100);
    vec2  q = foldN(p, 4.0);
    float brace = sdBar(vec2(q.x - 0.098, q.y), 0.140, 0.017);
    return vec2(min(min(shell, core), brace), sdPoly(vec2(p.y, p.x), 4.0, 0.052));
  }

  /* 5 — SEAL. The cage compacts into a slab and takes two struck slots. Mass:
     it is metal now, and it has been hit. */
  vec2 fSeal(vec2 p) {
    float slab = sdBox(p, vec2(0.255, 0.140));
    // knock the corners off: a struck seal, not a box
    slab = max(slab, (abs(p.x) + abs(p.y)) * 0.7071 - 0.252);
    float slots = min(sdBox(p - vec2(0.0,  0.060), vec2(0.145, 0.019)),
                      sdBox(p - vec2(0.0, -0.060), vec2(0.145, 0.019)));
    return vec2(slab, slots);
  }

  /* 6 — SIGIL. The slab opens into an eight-pointed mark on a diamond core.
     Identity: the last thing the dust becomes before it is only the word. */
  vec2 fSigil(vec2 p) {
    vec2  q = foldN(p, 4.0);
    float ray  = sdBar(q, 0.265, 0.020);
    vec2  r = foldN(vec2(p.x + p.y, p.y - p.x) * 0.7071, 4.0);
    float ray2 = sdBar(r, 0.175, 0.014);
    float core = abs(sdPoly(vec2(p.y, p.x), 4.0, 0.092)) - 0.018;
    return vec2(min(min(ray, ray2), core), sdPoly(vec2(p.y, p.x), 4.0, 0.048));
  }

  vec2 form(float id, vec2 p) {
    if (id < 0.5) return fFilament(p);
    if (id < 1.5) return fTriad(p);
    if (id < 2.5) return fLance(p);
    if (id < 3.5) return fGimbal(p);
    if (id < 4.5) return fCage(p);
    if (id < 5.5) return fSeal(p);
    return fSigil(p);
  }

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

    vec2 f = mix(form(uFormA, p), form(uFormB, p), uFormMix);
    float d = f.x;
    float inner = f.y;

    // scrubbing hard chips the edges off — the form visibly takes damage
    d += uShatter * 0.05 * sin(atan(p.y + 1e-6, p.x + 1e-6) * 9.0 + vSeed * 137.0);

    if (d > 0.26) discard;

    float edge = fwidth(d) + 0.004;
    float fill = smoothstep(edge, -edge, d);
    float rim  = exp(-abs(d) * (42.0 * uFacet));

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
    float scan = exp(-sb * sb) * fill * uScan * vLock;

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
    float formLod  = smoothstep(1.6, 5.0, vPx) * uFormFade;
    float innerLod = smoothstep(4.0, 9.5, vPx) * (1.0 - vBlur) * uFormFade;

    float shell = body * (0.55 + vLock * 0.55) + rim * 0.35 * vLock;
    float shape = shell + (core * 0.70 + scan * 0.45) * innerLod;

    // diffraction spikes off the facets of the ones that have locked hard
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

    // defocus takes the aperture's shape rather than dissolving to a smudge
    float soft = smoothstep(0.26, -0.18, d) * (0.72 + 0.5 * smoothstep(-0.02, 0.16, d));
    shape = mix(shape, soft, vBlur);

    vec3 col = mix(uCold, uHot, smoothstep(0.15, 0.95, vLock));
    col *= vShade;
    col *= 0.72 + vLock * uGlow;
    col += uHot * vGlint * 0.40;
    // the core and the scan line burn hotter than the body they sit in
    col += uHot * (core * 0.30 + scan * 0.40) * innerLod;

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
