/* =====================================================================
   LATTECANO — WebGL layer

   One persistent scene, one fixed canvas, running the whole page. A pool
   of coffee beans is re-choreographed section by section: they swarm the
   hero, drift past the manifesto, rain through the harvest, stream with
   the collection, arc along the shipping route and spiral into the CTA.

   Nothing is loaded from disk — the bean, its wrinkles, its colour
   variation and the environment it reflects are all generated in code.
   ===================================================================== */
(function (global) {
  'use strict';

  var hasWebGL = (function () {
    try {
      var c = document.createElement('canvas');
      return !!(global.WebGLRenderingContext &&
                (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  })();

  if (!global.THREE || !hasWebGL) {
    global.LattecanoBeans = { supported: false, create: function () { return null; } };
    return;
  }

  var THREE = global.THREE;
  var reduced = global.matchMedia &&
                global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var smooth = function (t) { return t * t * (3 - 2 * t); };

  /* Per-frame easing ("move 5% of the way each frame") runs at whatever speed
     the device happens to render at — snappy at 144fps, sluggish at 30. This
     converts a per-frame rate into the equivalent for the frame just drawn,
     so the motion takes the same wall-clock time everywhere. */
  function damp(rate, dt) {
    return 1 - Math.pow(1 - rate, dt * 60);
  }

  /* ------------------------------------------------------------------ */
  /* Cheap deterministic noise — used for wrinkles and colour mottling   */
  /* ------------------------------------------------------------------ */
  /* The obvious version of this — plain `*` on large constants, then a
     shift — loses precision in JS floats and comes back biased: over the
     inputs used here it never exceeded 0.5, so every per-bean "random" in
     the scene was squeezed into the bottom half of its range. Math.imul
     keeps the multiply in 32-bit integer space, which fixes the spread. */
  function hash3(x, y, z) {
    var h = Math.imul(x | 0, 374761393) ^
            Math.imul(y | 0, 668265263) ^
            Math.imul(z | 0, 1442695040);
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function vnoise3(x, y, z) {
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    var xf = x - xi, yf = y - yi, zf = z - zi;
    var u = smooth(xf), v = smooth(yf), w = smooth(zf);
    function c(dx, dy, dz) { return hash3(xi + dx, yi + dy, zi + dz); }
    var x00 = lerp(c(0,0,0), c(1,0,0), u), x10 = lerp(c(0,1,0), c(1,1,0), u);
    var x01 = lerp(c(0,0,1), c(1,0,1), u), x11 = lerp(c(0,1,1), c(1,1,1), u);
    return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
  }

  function fbm3(x, y, z, octaves) {
    var sum = 0, amp = 0.5, f = 1;
    for (var i = 0; i < (octaves || 4); i++) {
      sum += vnoise3(x * f, y * f, z * f) * amp;
      amp *= 0.5; f *= 2.07;
    }
    return sum;
  }

  /* ================================================================== */
  /* THE BEAN                                                           */
  /*                                                                    */
  /* A real coffee bean is not symmetric. One face is flat-to-concave   */
  /* and split by a wandering fissure; the other is a smooth dome. The  */
  /* fissure holds pale silverskin, which is why the centre line reads  */
  /* lighter than the body. All of that is built in here.               */
  /* ================================================================== */
  function beanGeometry(segments, seed) {
    var s = segments || 52;
    var geo = new THREE.SphereGeometry(1, s, Math.round(s * 0.76));
    var pos = geo.attributes.position;
    var sd = (seed || 1) * 7.13;
    var v = new THREE.Vector3();
    var i;

    // A narrow crease spikes when there are too few vertices to resolve it,
    // so its width tracks the tessellation. Small beans read fine slightly
    // softer; broken ones never do.
    var sigma = 0.040 + 1.9 / s;
    var sig2 = sigma * sigma;

    function creaseAt(x, y, tight) {
      var ny = Math.abs(y / 1.45);
      var wander = 0.13 * Math.sin(y * 1.65 + sd) + 0.045 * Math.sin(y * 4.1 - sd);
      var d = x - wander;
      var s2 = tight ? sig2 * 0.34 : sig2;
      return Math.exp(-(d * d) / s2) * (1 - Math.pow(ny, 5));
    }

    /* --- 1. the silhouette ------------------------------------------ */
    for (i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);

      // A stretched sphere tapers to almond points. A coffee bean is a
      // barrel with blunt ends, so swap the circular profile for a
      // superellipse that holds its width almost to the tips.
      // An arabica bean runs about 1 : 0.65 : 0.40 in length : width : depth,
      // with ends that are rounded but not flat. A stretched sphere gives
      // almond points and a strong superellipse gives a pill, so this sits
      // between the two.
      var u = v.y;                                   // sphere latitude, -1..1
      var circ = Math.sqrt(Math.max(1e-4, 1 - u * u));
      var blunt = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 2.15)), 1 / 2.15);
      var widen = blunt / circ;

      v.x *= widen * 0.94;
      v.z *= widen;
      v.y = u * 1.45;                    // long axis
      v.z *= 0.58;                       // squashed through the cut

      var ny = Math.abs(u);
      var taper = 1 - 0.12 * Math.pow(ny, 3);
      v.x *= taper;
      v.z *= taper;

      // front (z > 0) is the cut face, back is the dome — eased, not stepped
      var front = smooth(clamp((v.z + 0.02) / 0.24, 0, 1));
      var back = 1 - front;

      v.z *= 1 - 0.30 * front;           // flatten the cut face
      v.z *= 1 + 0.15 * back;            // bulge the dome

      var groove = creaseAt(v.x, v.y);
      v.z *= 1 - 0.80 * groove * front;
      v.x *= 1 + 0.052 * groove * front;  // the lips pinch outward

      // no two beans the same
      v.x += 0.022 * Math.sin(v.y * 3.1 + sd) * (0.5 + 0.5 * back);
      v.y += 0.014 * Math.sin(v.x * 2.6 - sd);

      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    /* --- 2. broad lumps only; the fine grain is a bump map ---------- */
    var nrm = geo.attributes.normal;
    var n = new THREE.Vector3();
    for (i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      n.fromBufferAttribute(nrm, i);
      var w = fbm3(v.x * 2.7 + sd, v.y * 2.2, v.z * 2.7, 3) - 0.5;
      var amt = w * 0.026;
      pos.setXYZ(i, v.x + n.x * amt, v.y + n.y * amt, v.z + n.z * amt);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    /* --- 3. vertex colour ------------------------------------------
       On a real bean the fissure is packed with silverskin — pale, dry,
       fibrous, and clearly LIGHTER than the body. Rendering it as a dark
       groove (which is what an occlusion-only model gives you) is the single
       thing that stops a bean reading as a bean. So: a bright fibrous fill
       down the centre, a thin shadow where the walls turn away from it, and
       an unevenly roasted body around both. */
    var col = new Float32Array(pos.count * 3);
    for (i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      var fr = smooth(clamp((v.z + 0.02) / 0.20, 0, 1));
      var fill = creaseAt(v.x, v.y, true) * fr;    // the silverskin itself
      var wide = creaseAt(v.x, v.y, false) * fr;   // fill plus its walls
      var wall = clamp(wide - fill * 1.3, 0, 1);   // where the walls turn away

      // the silverskin is fibrous — it streaks along the bean, not across it
      var fibre = 0.62 + 0.76 * fbm3(v.y * 22 + sd, v.x * 5, 1.7, 3);

      // roasting is never even: patches scorch harder than others
      var mottle = 0.80 + 0.30 * fbm3(v.x * 3.2 + sd, v.y * 2.6, v.z * 3.2, 3)
                        + 0.14 * fbm3(v.x * 1.3 - sd, v.y * 1.1, v.z * 1.3, 2);

      var tint = mottle * (1 - 0.32 * wall) + fill * 1.75 * fibre;

      // the silverskin is drier and paler than the bean, so it loses the red
      col[i * 3]     = tint;
      col[i * 3 + 1] = tint * (1 + 0.05 * fill);
      col[i * 3 + 2] = tint * (1 + 0.16 * fill);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    return geo;
  }

  /* ------------------------------------------------------------------ */
  /* Micro-relief: the pitting and grain a roasted bean has at close     */
  /* range. Doing this in a map rather than in vertices keeps the small  */
  /* beans cheap and stops the low-detail ones from tearing.             */
  /* ------------------------------------------------------------------ */
  var GRAIN = null, MATTE = null;

  function noiseCanvasTexture(n, contrast, floor, span, repeat) {
    var cv = document.createElement('canvas');
    cv.width = cv.height = n;
    var ctx = cv.getContext('2d');
    var img = ctx.createImageData(n, n);
    var d = img.data;
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var u = x / n * 9, w = y / n * 9;
        var val = fbm3(u * 1.6, w * 1.6, 0.5, 4) * 0.58 +
                  fbm3(u * 5.0, w * 5.0, 2.5, 3) * 0.42;
        val = clamp(0.5 + (val - 0.5) * contrast, 0, 1);
        val = floor + val * span;
        var c8 = Math.round(clamp(val, 0, 1) * 255);
        var k = (y * n + x) * 4;
        d[k] = d[k + 1] = d[k + 2] = c8;
        d[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    var tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    return tex;
  }

  /* Roughness is multiplied by its map, so a mid-grey map would halve it and
     turn a dry roasted bean into polished chocolate. This one sits high. */
  function matteTexture() {
    if (!MATTE) MATTE = noiseCanvasTexture(256, 1.6, 0.70, 0.30, 2);
    return MATTE;
  }

  function grainTexture() {
    if (GRAIN) return GRAIN;
    var n = 512;
    var cv = document.createElement('canvas');
    cv.width = cv.height = n;
    var ctx = cv.getContext('2d');
    var img = ctx.createImageData(n, n);
    var d = img.data;

    /* Octave scales matter more than octave count. Stacked too high, every
       feature lands under a pixel once the map is repeated over the mesh,
       the bump derivatives average out, and the surface renders dead smooth
       — which is exactly what the first version of this did. These three
       sit at roughly 36px, 11px and 4px, so they survive on screen. */
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var u = x / n * 9, w = y / n * 9;
        var val = fbm3(u * 1.6, w * 1.6, 0.5, 4) * 0.52 +   // broad dents
                  fbm3(u * 5.0, w * 5.0, 2.5, 3) * 0.32 +   // the pitting
                  fbm3(u * 14,  w * 14,  5.5, 2) * 0.16;    // fine pores
        val = clamp(0.5 + (val - 0.5) * 1.8, 0, 1);
        var c8 = Math.round(val * 255);
        var k = (y * n + x) * 4;
        d[k] = d[k + 1] = d[k + 2] = c8;
        d[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    GRAIN = new THREE.CanvasTexture(cv);
    GRAIN.wrapS = GRAIN.wrapT = THREE.RepeatWrapping;
    GRAIN.repeat.set(3, 3);
    return GRAIN;
  }

  var GEO = {};
  function sharedGeo(level) {
    var spec = { lo: [34, 1], mid: [54, 2], hi: [96, 3] }[level] || [54, 2];
    if (!GEO[level]) GEO[level] = beanGeometry(spec[0], spec[1]);
    return GEO[level];
  }

  /* The hero's cup is the collection's cup. It used to be a separate
     lathe with a lid on it, which meant two cups on one site that did not
     match and only one of them any good. This one is built by the shelf's
     module — same profile, same rolled rim, same corrugated sleeve, same
     coffee — with steam added, because here it stands still long enough
     for steam to read. */
  var HERO_CUP = {
    name: 'House Roast',
    lot: 'LOT 04',
    hex: 0x6E3E1D,
    roastLevel: 3,
    roastLine: 'SINGLE ORIGIN'
  };

  function buildCup(scene) {
    var cup = new THREE.Group();
    var vessel = null;

    // a phone's hero pane is a tall slot; the same cup fills it twice over
    var S = (global.innerWidth < 760) ? 2.15 : 2.72;
    if (global.LattecanoShelf && global.LattecanoShelf.supported) {
      vessel = global.LattecanoShelf.build(HERO_CUP);
      vessel.group.scale.setScalar(S);
      cup.add(vessel.group);
    }
    var RIM = S * 0.62;                // where the steam leaves the cup

    /* Steam. Three soft plumes that rise and fade — the one cue that says
       the cup is full and hot rather than a prop. */
    var steamMat = new THREE.MeshBasicMaterial({
      map: sunTexture(), transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
      toneMapped: false, color: 0xd8cbb6
    });
    var steam = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), steamMat, 14);
    steam.frustumCulled = false;
    cup.add(steam);
    var puffs = [];
    for (var sp = 0; sp < 14; sp++) {
      puffs.push({
        x: (hash3(sp, 5, 2) - 0.5) * 0.7,
        z: (hash3(sp, 9, 4) - 0.5) * 0.5,
        life: hash3(sp, 13, 6),
        size: 0.5 + hash3(sp, 17, 8) * 0.7,
        sway: (hash3(sp, 21, 10) - 0.5) * 1.4
      });
    }
    var sd2 = new THREE.Object3D();

    /* The cup comes out of the shelf already in proportion, so the group
       carries no stretch — the old one was a squat lathe propped up by a
       1 : 1.24 scale, which is what made its rim read as an oval. */
    cup.visible = false;
    scene.add(cup);

    var drag = 0, spin = 0, lean = 0, leanTo = 0;

    return {
      group: cup,
      setVisible: function (v) { cup.visible = v; },

      /* Flick it and it keeps going. A drag that only moves the cup while
         the pointer is down feels like a slider; carrying the velocity and
         letting friction take it makes it feel like an object. */
      nudge: function (dx) { spin += dx * 0.42; },

      /* And it leans toward the pointer even when you are not holding it,
         which is what makes the hero worth putting a cursor on at all. */
      look: function (x) { leanTo = clamp(x, -1, 1); },

      update: function (t, reveal, dolly, dt) {
        if (!cup.visible) return;
        var f = Math.min((dt || 0.016) * 60, 3);

        /* It rocks around front rather than spinning: a cup that turns all
           the way round shows its brand a third of the time. A flick still
           spins it fully, then friction and a soft pull bring it home. */
        spin *= Math.pow(0.935, f);
        spin += (-drag) * 0.0022 * f;
        drag += spin * f;

        lean += (leanTo - lean) * (1 - Math.pow(0.90, f));

        cup.rotation.y = Math.sin(t * 0.22) * 0.30 + drag + lean * 0.30;
        /* Tipped toward the reader: it is the only angle from which the
           coffee in it is visible at all. */
        cup.rotation.x = 0.30 + Math.sin(t * 0.33) * 0.022 - dolly * 0.10;
        cup.rotation.z = -0.13 + Math.sin(t * 0.4) * 0.025 - dolly * 0.16;
        cup.position.y = Math.sin(t * 0.55) * 0.09 - dolly * 0.5;
        cup.scale.setScalar(reveal);

        steamMat.opacity = reveal * 0.26;
        for (var i = 0; i < puffs.length; i++) {
          var q = puffs[i];
          q.life += (dt || 0.016) * 0.16;
          if (q.life > 1) q.life -= 1;
          sd2.position.set(
            q.x + Math.sin(t * 0.7 + i) * 0.28 * q.life * q.sway,
            RIM + q.life * 2.6,
            q.z
          );
          sd2.scale.setScalar(q.size * (0.35 + q.life * 1.8));
          sd2.updateMatrix();
          steam.setMatrixAt(i, sd2.matrix);
        }
        steam.instanceMatrix.needsUpdate = true;
      }
    };
  }

  /* ------------------------------------------------------------------ */
  /* The sun behind it, plus the dust it lights                          */
  /* ------------------------------------------------------------------ */
  function buildSky(scene) {
    var sky = new THREE.Group();

    var glow = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({
        map: sunTexture(), transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false,
        color: 0xffd9a0, opacity: 0
      }));
    glow.position.set(6.4, 3.6, -16);
    sky.add(glow);

    var core = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 2.1),
      new THREE.MeshBasicMaterial({
        map: sunTexture(), transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false,
        color: 0xfff3d2, opacity: 0
      }));
    core.position.set(6.4, 3.6, -15.8);
    sky.add(core);

    // a thin anamorphic streak, the way a wide lens smears a highlight
    var streak = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 0.5),
      new THREE.MeshBasicMaterial({
        map: sunTexture(), transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false,
        color: 0xffcf96, opacity: 0
      }));
    streak.position.set(6.4, 3.6, -15.9);
    sky.add(streak);

    var N = 420;
    var pos = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      pos[i * 3]     = (hash3(i, 3, 1) - 0.5) * 70;
      pos[i * 3 + 1] = (hash3(i, 7, 2) - 0.5) * 42;
      pos[i * 3 + 2] = -6 - hash3(i, 11, 3) * 34;
    }
    var pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var stars = new THREE.Points(pg, new THREE.PointsMaterial({
      color: 0xfff0d8, size: 0.06, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending
    }));
    sky.add(stars);

    sky.visible = false;
    scene.add(sky);

    return {
      group: sky,
      setVisible: function (v) { sky.visible = v; },
      update: function (t, reveal) {
        if (!sky.visible) return;
        var flicker = 0.9 + Math.sin(t * 1.7) * 0.1;
        glow.material.opacity = reveal * 0.58 * flicker;
        core.material.opacity = reveal * 0.95 * flicker;
        streak.material.opacity = reveal * 0.20 * flicker;
        stars.material.opacity = reveal * 0.55;
      }
    };
  }

  var SUNTEX = null;
  function sunTexture() {
    if (SUNTEX) return SUNTEX;
    var n = 128;
    var cv = document.createElement('canvas');
    cv.width = cv.height = n;
    var g = cv.getContext('2d');
    var rg = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    rg.addColorStop(0.00, 'rgba(255,255,255,1)');
    rg.addColorStop(0.12, 'rgba(255,244,222,0.92)');
    rg.addColorStop(0.36, 'rgba(255,205,140,0.34)');
    rg.addColorStop(1.00, 'rgba(255,180,110,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, n, n);
    SUNTEX = new THREE.CanvasTexture(cv);
    return SUNTEX;
  }

  /* ------------------------------------------------------------------ */
  /* CLOUDS                                                              */
  /*                                                                     */
  /* Coffee this good grows above the cloud line, so the harvest section  */
  /* sits in it. Each cloud is a mass of soft billboards rather than one  */
  /* sprite — overlapping puffs at different depths are what give it      */
  /* volume, and drifting them at speeds tied to their distance is what   */
  /* sells the parallax.                                                  */
  /* ------------------------------------------------------------------ */
  var PUFF = null;
  function puffTexture() {
    if (PUFF) return PUFF;
    var n = 256;
    var cv = document.createElement('canvas');
    cv.width = cv.height = n;
    var ctx = cv.getContext('2d');
    var img = ctx.createImageData(n, n);
    var d = img.data;

    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var u = (x / n - 0.5) * 2, v = (y / n - 0.5) * 2;
        var r = Math.sqrt(u * u + v * v);

        // a soft disc, eaten into by noise so the edge is ragged not round
        // a firm core with a ragged falloff: overlapping cores build a solid
        // body, and only the rim stays wispy
        var edge = 1 - smooth(clamp((r - 0.30) / 0.70, 0, 1));
        edge = Math.pow(edge, 0.72);
        var lumps = fbm3(u * 2.9 + 11, v * 2.9 + 3, 0.7, 4);
        var a = edge * (0.86 + lumps * 0.62) - 0.05;
        a = clamp(a, 0, 1);
        a = a * a * (3 - 2 * a);

        var k = (y * n + x) * 4;
        d[k] = d[k + 1] = d[k + 2] = 255;
        d[k + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    PUFF = new THREE.CanvasTexture(cv);
    PUFF.premultiplyAlpha = false;
    return PUFF;
  }

  function buildClouds(scene) {
    var small = global.innerWidth < 760;
    // Volume comes from many small overlapping puffs. A few large ones just
    // read as a grey smear however soft the texture is.
    var MASSES = small ? 9 : 14;
    var PER = small ? 16 : 26;
    var COUNT = MASSES * PER;

    var geo = new THREE.PlaneGeometry(1, 1);
    var mat = new THREE.MeshBasicMaterial({
      map: puffTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0,
      toneMapped: false
    });

    var mesh = new THREE.InstancedMesh(geo, mat, COUNT);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;                 // always behind the beans
    mesh.visible = false;

    var puffs = [];
    var i, m;
    for (m = 0; m < MASSES; m++) {
      var mx = (m / MASSES - 0.5) * 88 + (hash3(m, 5, 1) - 0.5) * 12;
      var my = -5.0 + hash3(m, 9, 2) * 11;
      var mz = -4 - hash3(m, 13, 3) * 44;
      var rx = 4.5 + hash3(m, 17, 4) * 4.5;
      var ry = 1.3 + hash3(m, 21, 5) * 1.3;

      for (i = 0; i < PER; i++) {
        var id = m * PER + i;
        var t = i / PER;
        puffs.push({
          mass: m,
          x: mx + (hash3(id, 31, 6) - 0.5) * rx * 2,
          y: my + (hash3(id, 37, 7) - 0.5) * ry * 2,
          z: mz + (hash3(id, 41, 8) - 0.5) * 4,
          // a puff's own height inside its mass decides how lit it is
          lift: (hash3(id, 37, 7) - 0.5),
          size: 2.6 + hash3(id, 43, 9) * 4.0,
          spin: (hash3(id, 47, 10) - 0.5) * 0.05,
          rot: hash3(id, 53, 11) * 6.28,
          baseX: 0
        });
        puffs[puffs.length - 1].baseX = puffs[puffs.length - 1].x;
      }
    }

    // Back to front, once. Instanced transparency has no per-instance sort,
    // and the puffs only ever move sideways, so this ordering holds.
    puffs.sort(function (a, b) { return a.z - b.z; });

    var dummy = new THREE.Object3D();
    var col = new THREE.Color();
    // Sunlit tops, cool undersides — the contrast between the two is what
    // makes a billboard read as a cloud rather than as a smudge.
    var SUN = new THREE.Color(0xffffff);
    var SHADE = new THREE.Color(0x6d8095);

    for (i = 0; i < COUNT; i++) {
      var p = puffs[i];
      // distance pales them out — ordinary atmospheric perspective
      var far = clamp((-p.z - 6) / 40, 0, 1);
      col.copy(SHADE).lerp(SUN, clamp(0.52 + p.lift * 2.2, 0, 1));
      col.lerp(new THREE.Color(0xc4d0d9), far * 0.5);
      mesh.setColorAt(i, col);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    scene.add(mesh);

    return {
      mesh: mesh,
      material: mat,
      update: function (t, opacity, rise) {
        mat.opacity = opacity;
        mesh.visible = opacity > 0.004;
        if (!mesh.visible) return;

        for (var i = 0; i < COUNT; i++) {
          var p = puffs[i];
          // nearer clouds run faster; that difference is the parallax
          var speed = 0.10 + (1 - clamp((-p.z - 6) / 40, 0, 1)) * 0.42;
          var x = p.baseX + (reduced ? 0 : t * speed);
          var span = 96;
          x = ((x + span * 0.5) % span + span) % span - span * 0.5;

          dummy.position.set(x, p.y + rise, p.z);
          dummy.rotation.set(0, 0, p.rot + (reduced ? 0 : t * p.spin));
          dummy.scale.setScalar(p.size);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    };
  }

  /* ------------------------------------------------------------------ */
  /* A small studio, painted on a canvas and convolved into an env map.  */
  /* This is what gives the beans believable specular roll-off.          */
  /* ------------------------------------------------------------------ */
  function studioEnv(renderer) {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    var g = c.getContext('2d');

    var sky = g.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0.00, '#d8c4a6');
    sky.addColorStop(0.42, '#7a6450');
    sky.addColorStop(0.52, '#2e2218');
    sky.addColorStop(1.00, '#0b0805');
    g.fillStyle = sky; g.fillRect(0, 0, 512, 256);

    function blob(x, y, r, colour) {
      var rg = g.createRadialGradient(x, y, 2, x, y, r);
      rg.addColorStop(0, colour);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 512, 256);
    }
    blob(132, 54, 118, 'rgba(255,250,242,0.95)'); // key
    blob(360, 96, 150, 'rgba(214,180,138,0.62)'); // warm fill
    blob(470, 150, 96, 'rgba(180,78,58,0.24)');   // cherry bounce

    var tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;

    var pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    var rt = pmrem.fromEquirectangular(tex);
    pmrem.dispose();
    tex.dispose();
    return rt.texture;
  }

  /* ================================================================== */
  /* FORMATIONS                                                         */
  /*                                                                    */
  /* Each one places bean i somewhere in view space. Beans ease toward   */
  /* whichever formation the scroll has selected, so the arrangement     */
  /* morphs continuously instead of cutting.                            */
  /* ================================================================== */
  var TAU = Math.PI * 2;

  // Low-discrepancy sequences, not raw randoms. Random placement clumps —
  // beans end up intersecting each other, which reads as one melted lump.
  var PHI = 0.6180339887;
  var GOLD = 2.39996323;                        // golden angle, radians
  function span(i, lo, hi) {                    // even 1-D spread, no gaps
    return lo + (((i * PHI) % 1)) * (hi - lo);
  }

  /* A bean parked at world x = 6 sits near the edge when it is close and
     halfway across the copy when it is far. Formations that need to stay
     clear of text therefore place themselves in screen fractions, and this
     converts those back to world units at whatever depth they chose. */
  var FORMATIONS = {
    /* hero: a ring of beans orbiting the cup. The ring is tilted almost
       edge-on so beans sweep behind the cup and back in front of it —
       that pass is what reads as depth rather than as a flat halo. */
    swarm: function (b, i, n, t, p, view) {
      /* Golden-angle spacing, not evenly-indexed arcs: a projected circle
         crowds its own turning points, so evenly spaced beans pile into two
         clumps at the left and right edges. This keeps the sweep even, and
         the jitter gives it body, so it reads as a swirl around the cup
         rather than as a wire hoop. */
      var a = i * GOLD + t * 0.30;
      var R = 2.6 + b.r1 * 2.1 - p * 0.3;
      var u = Math.cos(a) * R;
      var v = Math.sin(a) * R;
      var tilt = 1.16;                         // near edge-on

      return {
        x: u + (b.r2 - 0.5) * 1.4,
        y: v * Math.sin(tilt) * 0.40 + (b.r3 - 0.5) * 2.5 + 0.1,
        // a deep sweep, so beans pass plainly in front of and behind the cup
        // the ring sits a little behind the cup, so fewer beans swell up
        // right at the lens
        z: v * Math.cos(tilt) * 1.5 + (b.r2 - 0.5) * 1.6 - 0.9,
        // small against the cup, the way they are in the reference
        s: b.size * 0.34
      };
    },

    // manifesto / quote: a few large beans loitering in the margins
    margin: function (b, i, n, t, p, view) {
      var keep = i < 10;
      var side = (i % 2) ? 1 : -1;
      var k = Math.floor(i / 2) / 5;
      var z = -1 - (i % 4) * 1.9;
      return {
        x: side * view.halfW(z) * (0.84 + (i % 3) * 0.07),
        y: (k - 0.5) * view.halfH(z) * 1.75 + Math.sin(t * 0.3 + i) * 0.4,
        z: z,
        s: keep ? b.size * 1.45 : 0
      };
    },

    // harvest: cherries coming off the tree, staggered so none collide
    fall: function (b, i, n, t, p, view) {
      var cycle = 17;
      var z = -2.5 - (i % 5) * 2.1;
      return {
        x: span(i, -0.94, 0.94) * view.halfW(z),
        y: 8.5 - ((p * 14 + (i / n) * cycle + t * 0.5) % cycle),
        z: z,
        s: b.size * 0.95
      };
    },

    // roasts / brew: quiet, well clear of the copy
    sparse: function (b, i, n, t, p, view) {
      var keep = i % 3 === 0;
      var side = (i % 2) ? 1 : -1;
      var k = Math.floor(i / 6) / 3;
      var z = -3.5 - (i % 3) * 2.4;
      return {
        x: side * view.halfW(z) * (0.88 + (i % 4) * 0.05),
        y: (k - 0.5) * view.halfH(z) * 1.7 + Math.sin(t * 0.26 + i) * 0.35,
        z: z,
        s: keep ? b.size * 1.2 : 0
      };
    },

    // roast lab: the feature bean, with a ring holding station behind it
    orbit: function (b, i, n, t, p, view) {
      if (i === 0) {
        // On a phone the panel takes the lower half, so lift the bean into
        // the space above it instead of sitting behind the controls.
        var portrait = view._aspect < 1;
        return {
          x: portrait ? 0 : 0.05,
          y: portrait ? view.halfH(3.2) * 0.44 : 0,
          z: 3.2,
          // sized to fill roughly 45% of the viewport height at camera z=12
          s: portrait ? 0.74 : 1.0
        };
      }
      if (i > 13) return { x: 0, y: 0, z: -18, s: 0 };
      var k = (i - 1) / 13;
      var a = k * TAU + t * 0.09;
      return {
        x: Math.cos(a) * (4.2 + (i % 3) * 0.5),
        y: Math.sin(a) * (2.7 + (i % 2) * 0.5),
        z: -2 - (i % 4) * 1.6,
        s: b.size * 0.78
      };
    },

    // collection: scenery passing the other way
    stream: function (b, i, n, t, p, view) {
      var cycle = 30;
      var z = -2.5 - (i % 6) * 1.9;
      return {
        x: 15 - ((p * 24 + (i / n) * cycle + t * 1.0) % cycle),
        y: span(i * 3 + 1, -0.9, 0.9) * view.halfH(z),
        z: z,
        s: b.size
      };
    },

    // journey: strung along the shipping arc, travelling it
    arc: function (b, i, n, t, p, view) {
      var travel = ((i / n) + t * 0.04) % 1;
      return {
        x: lerp(-8.2, 8.2, travel),
        y: Math.sin(travel * Math.PI) * 3.4 - 1.2 + Math.sin(t * 0.7 + i) * 0.14,
        z: -1.5 - (i % 5) * 1.7,
        s: b.size * 0.92
      };
    },

    // cta: everything drawn into the cup
    // cta: a halo drawn around the copy, deliberately hollow in the middle
    // so the heading and the form are never crossed
    swirl: function (b, i, n, t, p, view) {
      var k = i / n;
      var a = k * TAU * 2.2 + t * 0.26;
      var z = -1 - (i % 6) * 1.5;
      var r = 0.74 + k * 0.48;          // fraction of the half-viewport
      return {
        x: Math.cos(a) * view.halfW(z) * r,
        y: Math.sin(a) * view.halfH(z) * r * 1.1,
        z: z,
        s: b.size
      };
    }
  };

  /* ================================================================== */
  /* THE FIELD                                                          */
  /* ================================================================== */
  function create(canvas) {
    if (!canvas) return null;

    var renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: true, alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 1.75));
    renderer.setClearAlpha(0);
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    var scene = new THREE.Scene();
    scene.environment = studioEnv(renderer);

    var camera = new THREE.PerspectiveCamera(40, 1, 0.1, 90);
    camera.position.set(0, 0, 12);

    /* --- lights: they shift as the page moves light ↔ dark ---------- */
    var ambient = new THREE.AmbientLight(0xffe8cc, 0.7);
    scene.add(ambient);

    var key = new THREE.DirectionalLight(0xfff0d8, 2.6);
    key.position.set(-5, 6, 7);
    scene.add(key);

    var rim = new THREE.DirectionalLight(0xd9a96c, 1.5);
    rim.position.set(6, -2, -5);
    scene.add(rim);

    var cherry = new THREE.PointLight(0xc33c2b, 20, 30, 2);
    cherry.position.set(5, -2, 4);
    scene.add(cherry);

    var clouds = buildClouds(scene);
    var cup = buildCup(scene);
    var sky = buildSky(scene);

    /* --- the pool --------------------------------------------------- */
    var small = global.innerWidth < 760;
    var COUNT = small ? 24 : 44;

    var baseColour = new THREE.Color(0x6b3d20);
    var grain = grainTexture();
    var matte = matteTexture();
    var beans = [];

    for (var i = 0; i < COUNT; i++) {
      var r1 = hash3(i, 11, 3), r2 = hash3(i, 29, 7), r3 = hash3(i, 47, 13);

      // the feature bean and the nearest few get real geometry
      var level = i === 0 ? 'hi' : (i < 8 ? 'mid' : 'lo');

      var mat = new THREE.MeshPhysicalMaterial({
        color: baseColour.clone(),
        vertexColors: true,
        bumpMap: grain,
        // bumpScale here is not a 0–1 knob: on a mesh this size anything
        // under ~1 renders as a dead smooth surface. Swept it to find out.
        bumpScale: i === 0 ? 1.6 : 1.1,
        roughnessMap: matte,
        roughness: 0.94,
        metalness: 0.0,
        clearcoat: 0.20,
        clearcoatRoughness: 0.58,
        sheen: 0.25,
        sheenRoughness: 0.9,
        sheenColor: new THREE.Color(0x8a6244),
        envMapIntensity: 0.85
      });

      var m = new THREE.Mesh(sharedGeo(level), mat);
      m.scale.setScalar(0.001);

      beans.push({
        mesh: m,
        mat: mat,
        seed: r1 * 10,
        r1: r1, r2: r2, r3: r3,
        // The feature bean is only large where a formation asks for it
        // (swarm, orbit); everywhere else it is just another bean.
        size: i === 0 ? 0.60 : 0.34 + r2 * 0.62,
        // every bean roasts slightly differently
        tint: 0.84 + r3 * 0.34,
        pose: i === 0,
        drag: 0,
        spin: new THREE.Vector3((r1 - 0.5) * 0.30, (r2 - 0.5) * 0.36, (r3 - 0.5) * 0.24),
        cur: new THREE.Vector3(0, 0, -14),
        curS: 0.001
      });

      if (i === 0) {
        // presented, not tumbling: crease upright, a slight three-quarter tilt
        m.rotation.set(0.10, -0.45, 0.20);
      } else {
        m.rotation.set(r1 * TAU, r2 * TAU, r3 * TAU);
      }
      scene.add(m);
    }

    /* --- state ------------------------------------------------------ */
    var state = {
      formation: 'swarm', prevFormation: 'swarm', blend: 1,
      local: 0,            // progress inside the current section
      heroDolly: 0,        // hero-only camera push
      pointer: { x: 0, y: 0 }, smooth: { x: 0, y: 0 },
      camZ: 12,
      cloudCur: 0,
      heroCur: 0,
      light: 0,            // 0 = dark section, 1 = light section
      lightCur: 0,
      roast: { target: new THREE.Color(0x6b3d20), cur: new THREE.Color(0x6b3d20),
               oil: 0.20, oilCur: 0.20, rough: 0.74, roughCur: 0.74 },
      running: false, hidden: false
    };

    var clock = new THREE.Clock();
    var tmp = new THREE.Vector3();

    // how much world space the camera sees at a given depth; kept current by
    // resize() below, and used by formations that place in screen fractions
    var view = {
      halfH: function (z) { return (state.camZ - z) * view._tan; },
      halfW: function (z) { return (state.camZ - z) * view._tan * view._aspect; },
      _tan: Math.tan(40 * Math.PI / 360),
      _aspect: 1.6
    };

    function resize() {
      var w = global.innerWidth;
      var h = global.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      view._aspect = camera.aspect;
      view._tan = Math.tan(camera.fov * Math.PI / 360);
    }

    function place(b, i, t) {
      var f = FORMATIONS[state.formation] || FORMATIONS.swarm;
      var target = f(b, i, COUNT, t, state.local, view);

      if (state.blend < 1) {
        var pf = FORMATIONS[state.prevFormation] || FORMATIONS.swarm;
        var prev = pf(b, i, COUNT, t, state.local, view);
        var k = smooth(state.blend);
        target = {
          x: lerp(prev.x, target.x, k),
          y: lerp(prev.y, target.y, k),
          z: lerp(prev.z, target.z, k),
          s: lerp(prev.s, target.s, k)
        };
      }
      return target;
    }

    function frame() {
      if (!state.running) return;
      global.requestAnimationFrame(frame);
      if (state.hidden) return;

      var dt = Math.min(clock.getDelta(), 0.05);
      var t = clock.elapsedTime;

      if (state.blend < 1) state.blend = Math.min(1, state.blend + dt * 1.15);

      /* pointer parallax on the camera */
      var kPointer = damp(0.05, dt);
      state.smooth.x = lerp(state.smooth.x, state.pointer.x, kPointer);
      state.smooth.y = lerp(state.smooth.y, state.pointer.y, kPointer);
      camera.position.x = state.smooth.x * 1.15;
      camera.position.y = state.smooth.y * -0.8;

      // The dolly belongs to the hero alone. Without this the camera stays
      // parked at hero-close range and every later section renders enormous.
      // it closes on the cup rather than passing through it
      var camTarget = state.formation === 'swarm' ? lerp(12, 7.4, state.heroDolly) : 12;
      state.camZ = lerp(state.camZ, camTarget, damp(0.07, dt));
      camera.position.z = state.camZ;
      camera.lookAt(state.smooth.x * 0.35, state.smooth.y * -0.25, camera.position.z - 9);

      /* the cup and its sun belong to the hero */
      var wantHero = state.formation === 'swarm' ? 1 : 0;
      state.heroCur = lerp(state.heroCur, wantHero, damp(0.06, dt));
      var heroOn = state.heroCur > 0.01;
      cup.setVisible(heroOn);
      sky.setVisible(heroOn);
      cup.update(t, state.heroCur, state.heroDolly, dt);
      sky.update(t, state.heroCur);

      /* The bank belongs to the harvest section alone. The canvas is fixed and
         full-viewport, so without fading at both ends the clouds spill over
         whichever section is arriving next. */
      var wantCloud = 0;
      if (state.formation === 'fall') {
        var lp = state.local;
        wantCloud = smooth(clamp(lp / 0.12, 0, 1)) *
                    smooth(clamp((0.88 - lp) / 0.12, 0, 1));
      }
      state.cloudCur = lerp(state.cloudCur, wantCloud, damp(0.05, dt));
      clouds.update(t, state.cloudCur * 0.92, (state.local - 0.5) * -3.2);

      /* daylight on the cream sections, roastery gloom on the dark ones */
      state.lightCur = lerp(state.lightCur, state.light, damp(0.06, dt));
      var L = state.lightCur;
      ambient.intensity = lerp(0.55, 1.35, L);
      key.intensity = lerp(2.6, 3.8, L);
      rim.intensity = lerp(1.5, 0.75, L);
      cherry.intensity = lerp(18 + Math.sin(t * 1.1) * 5, 4, L);
      renderer.toneMappingExposure = lerp(1.08, 0.98, L);

      /* roast colour eases across the whole field */
      var R = state.roast;
      var kRoast = damp(0.07, dt);
      R.cur.lerp(R.target, kRoast);
      R.oilCur = lerp(R.oilCur, R.oil, kRoast);
      R.roughCur = lerp(R.roughCur, R.rough, kRoast);

      /* The hero ring is driven — its targets orbit continuously — so a slow
         follow lags behind and the ring collapses toward the middle. Static
         formations keep the softer rate. */
      var kMove = damp(state.formation === 'swarm' ? 0.20 : 0.055, dt);
      var kScale = damp(0.075, dt);

      for (var i = 0; i < beans.length; i++) {
        var b = beans[i];

        var target = place(b, i, t);
        tmp.set(target.x, target.y, target.z);
        b.cur.lerp(tmp, reduced ? 1 : kMove);
        b.curS = lerp(b.curS, Math.max(target.s, 0.0001), kScale);

        b.mesh.position.copy(b.cur);
        b.mesh.scale.setScalar(b.curS);
        b.mesh.visible = b.curS > 0.01;

        if (b.pose) {
          // Left to spin freely it ends up showing its blank back. Rock it
          // around the pose instead, so the fissure always faces the reader.
          b.mesh.rotation.y = -0.38 + b.drag +
                              (reduced ? 0 : Math.sin(t * 0.22) * 0.55);
          b.mesh.rotation.x = 0.10 + (reduced ? 0 : Math.sin(t * 0.17) * 0.07);
        } else if (!reduced && b.mesh.visible) {
          b.mesh.rotation.x += b.spin.x * dt;
          b.mesh.rotation.y += b.spin.y * dt;
          b.mesh.rotation.z += b.spin.z * dt;
        }

        // per-bean roast variation, so the batch never looks uniform
        b.mat.color.copy(R.cur).multiplyScalar(b.tint);
        b.mat.clearcoat = R.oilCur;
        b.mat.roughness = R.roughCur;
        b.mat.envMapIntensity = lerp(0.85, 1.35, L);
      }

      renderer.render(scene, camera);
    }

    function start() {
      if (state.running) return;
      state.running = true;
      clock.start();
      global.requestAnimationFrame(frame);
    }

    document.addEventListener('visibilitychange', function () {
      state.hidden = document.hidden;
    });

    resize();
    start();

    return {
      resize: resize,

      /* swap arrangements; the change eases in rather than cutting */
      setFormation: function (name, localProgress) {
        if (!FORMATIONS[name]) return;
        if (name !== state.formation) {
          state.prevFormation = state.formation;
          state.formation = name;
          state.blend = 0;
        }
        if (typeof localProgress === 'number') state.local = localProgress;
      },

      setLocal: function (p) { state.local = p; },
      setHeroDolly: function (p) { state.heroDolly = clamp(p, 0, 1); },
      setLight: function (v) { state.light = clamp(v, 0, 1); },
      setPointer: function (x, y) { state.pointer.x = x; state.pointer.y = y; },

      setRoast: function (hex, oil, rough) {
        state.roast.target.set(hex);
        if (typeof oil === 'number') state.roast.oil = oil;
        if (typeof rough === 'number') state.roast.rough = rough;
      },

      /* the lab lets you spin the feature bean by hand */
      nudgeFeature: function (dx) {
        if (beans[0]) beans[0].drag += dx;
      },

      nudgeCup: function (dx) { cup.nudge(dx); },
      lookCup: function (x) { cup.look(x); },

      /* for diagnostics: what the field currently thinks it is doing */
      debug: function () {
        var xs = [], ys = [], zs = [], ss = [];
        for (var i = 0; i < beans.length; i++) {
          xs.push(beans[i].cur.x); ys.push(beans[i].cur.y);
          zs.push(beans[i].cur.z); ss.push(beans[i].curS);
        }
        var rng = function (a) {
          return [Math.min.apply(null, a).toFixed(2),
                  Math.max.apply(null, a).toFixed(2)].join(' … ');
        };
        return { formation: state.formation, prev: state.prevFormation,
                 blend: state.blend, local: state.local, camZ: state.camZ,
                 light: state.lightCur, hero: state.heroCur, count: beans.length,
                 x: rng(xs), y: rng(ys), z: rng(zs), scale: rng(ss) };
      },

      dispose: function () { state.running = false; renderer.dispose(); }
    };
  }

  global.LattecanoBeans = {
    supported: true,
    create: create,
    beanGeometry: beanGeometry,
    grainTexture: grainTexture,
    matteTexture: matteTexture
  };
})(window);
