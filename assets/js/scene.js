/* =====================================================================
   LATTECANO — WebGL layer
   Two small three.js scenes that give the page real depth:
     · hero  — a field of coffee beans the camera flies through on scroll
     · lab   — one large bean whose roast you can dial in and spin
   Everything (geometry + textures) is generated in code; no assets.
   ===================================================================== */
(function (global) {
  'use strict';

  var hasWebGL = (function () {
    try {
      var c = document.createElement('canvas');
      return !!(global.WebGLRenderingContext &&
                (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  })();

  if (!global.THREE || !hasWebGL) {
    global.LattecanoScene = { supported: false, hero: null, lab: null };
    return;
  }

  var THREE = global.THREE;
  var reduced = global.matchMedia &&
                global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- */
  /* Geometry: a coffee bean, sculpted out of a sphere                  */
  /* ---------------------------------------------------------------- */
  function beanGeometry(segments) {
    var s = segments || 84;
    var geo = new THREE.SphereGeometry(1, s, Math.round(s * 0.72));
    var pos = geo.attributes.position;
    var v = new THREE.Vector3();

    for (var i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);

      // oval body: long on Y, squashed on Z
      v.y *= 1.32;
      v.z *= 0.58;

      // taper the two tips so it reads as a bean, not a pill
      var ny = Math.abs(v.y / 1.32);
      var taper = 1 - 0.20 * Math.pow(ny, 3);
      v.x *= taper;
      v.z *= taper;

      // the centre crease — it wanders, real beans are never straight
      var wander = 0.11 * Math.sin(v.y * 1.85);
      var d = v.x - wander;
      var groove = Math.exp(-(d * d) / 0.034);
      groove *= 1 - Math.pow(ny, 6);           // fade out at the tips
      v.z *= 1 - 0.80 * groove;                // scaling keeps it seamless
      v.x *= 1 + 0.035 * groove;               // tiny pinch at the lips

      // a little organic asymmetry
      v.x += 0.012 * Math.sin(v.y * 4.1 + v.z * 3.0);

      pos.setXYZ(i, v.x, v.y, v.z);
    }

    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  /* ---------------------------------------------------------------- */
  /* Texture: value noise, used for roughness + micro bump             */
  /* ---------------------------------------------------------------- */
  function noiseTexture(size, contrast, floor, range) {
    var n = size || 256;
    var cv = document.createElement('canvas');
    cv.width = cv.height = n;
    var ctx = cv.getContext('2d');
    var img = ctx.createImageData(n, n);
    var data = img.data;

    // a few octaves of cheap value noise
    function hash(x, y) {
      var h = x * 374761393 + y * 668265263;
      h = (h ^ (h >> 13)) * 1274126177;
      return ((h ^ (h >> 16)) >>> 0) / 4294967295;
    }
    function smooth(x, y, f) {
      var xi = Math.floor(x * f), yi = Math.floor(y * f);
      var xf = x * f - xi, yf = y * f - yi;
      var u = xf * xf * (3 - 2 * xf), vv = yf * yf * (3 - 2 * yf);
      var a = hash(xi, yi), b = hash(xi + 1, yi);
      var c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
      return (a * (1 - u) + b * u) * (1 - vv) + (c * (1 - u) + d * u) * vv;
    }

    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var u = x / n, w = y / n;
        var val = smooth(u, w, 12) * 0.5 +
                  smooth(u, w, 34) * 0.32 +
                  smooth(u, w, 90) * 0.18;
        val = 0.5 + (val - 0.5) * (contrast || 1.35);
        if (typeof floor === 'number') val = floor + val * (range || (1 - floor));
        var c8 = Math.max(0, Math.min(255, Math.round(val * 255)));
        var idx = (y * n + x) * 4;
        data[idx] = data[idx + 1] = data[idx + 2] = c8;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    var tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // one geometry per detail level, built once and shared by every mesh
  var GEO = {}, NOISE = null, ROUGH = null;
  function sharedGeo(detail) {
    var s = detail || 48;
    if (!GEO[s]) GEO[s] = beanGeometry(s);
    return GEO[s];
  }
  function sharedNoise() { if (!NOISE) NOISE = noiseTexture(256, 1.4); return NOISE; }
  // a high-biased copy: roughness is multiplied by this, and a roasted bean
  // should never come out looking like polished plastic
  function sharedRough() { if (!ROUGH) ROUGH = noiseTexture(256, 1.4, 0.74, 0.26); return ROUGH; }

  /* ---------------------------------------------------------------- */
  /* Shared renderer helpers                                           */
  /* ---------------------------------------------------------------- */
  function makeRenderer(canvas) {
    var r = new THREE.WebGLRenderer({
      canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance'
    });
    r.setPixelRatio(Math.min(global.devicePixelRatio || 1, 1.75));
    r.setClearColor(0x120b07, 1);
    if ('outputColorSpace' in r) r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.28;
    return r;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ================================================================= */
  /* HERO — a drift of beans, flown through on scroll                  */
  /* ================================================================= */
  function createHero(canvas) {
    if (!canvas) return null;

    var renderer = makeRenderer(canvas);
    var scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x120b07, 0.034);

    var camera = new THREE.PerspectiveCamera(46, 1, 0.1, 120);
    camera.position.set(0, 0, 9);

    /* --- lighting: warm key, cherry rim, soft fill ------------------ */
    scene.add(new THREE.AmbientLight(0x5c4230, 1.15));

    var key = new THREE.DirectionalLight(0xffd8a6, 3.3);
    key.position.set(-5, 7, 8);
    scene.add(key);

    var rim = new THREE.DirectionalLight(0xd9a96c, 1.9);
    rim.position.set(6, -3, -6);
    scene.add(rim);

    var cherry = new THREE.PointLight(0xc33c2b, 26, 26, 2);
    cherry.position.set(4.5, -1.5, 3);
    scene.add(cherry);

    var lift = new THREE.PointLight(0xf2e7d6, 12, 20, 2);
    lift.position.set(-3.5, 2.5, 4);
    scene.add(lift);

    /* --- the beans --------------------------------------------------*/
    var small = global.innerWidth < 760;
    var geo = sharedGeo(small ? 30 : 40);
    var heroGeo = sharedGeo(small ? 44 : 60);
    var rough = sharedRough();
    var palette = [0x6b3d20, 0x855029, 0x4a2a18, 0x9a6234, 0x3a2012, 0x7a4a2e];

    var beans = [];
    var COUNT = small ? 16 : 28;

    for (var i = 0; i < COUNT; i++) {
      var mat = new THREE.MeshStandardMaterial({
        color: palette[i % palette.length],
        roughness: 1,
        metalness: 0.02,
        roughnessMap: rough
      });

      // hero bean sits dead centre, the rest drift around the flight path
      var lead = i === 0;
      var m = new THREE.Mesh(lead ? heroGeo : geo, mat);
      var radius = lead ? 0 : 1.9 + Math.random() * 5.4;
      var angle = Math.random() * Math.PI * 2;

      m.position.set(
        lead ? 0 : Math.cos(angle) * radius,
        lead ? 0 : Math.sin(angle) * radius * 0.62,
        lead ? -1.4 : -2 - Math.random() * 26
      );

      var s = lead ? 0.92 : 0.30 + Math.random() * 0.62;
      m.scale.setScalar(s);
      m.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);

      m.userData = {
        lead: lead,
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 0.24,
          (Math.random() - 0.5) * 0.3,
          (Math.random() - 0.5) * 0.18
        ),
        bob: Math.random() * 6.28,
        bobAmp: lead ? 0.09 : 0.1 + Math.random() * 0.22,
        baseY: 0
      };
      m.userData.baseY = m.position.y;

      scene.add(m);
      beans.push(m);
    }

    /* --- aroma motes ------------------------------------------------*/
    var PCOUNT = 520;
    var parr = new Float32Array(PCOUNT * 3);
    for (var p = 0; p < PCOUNT; p++) {
      parr[p * 3]     = (Math.random() - 0.5) * 22;
      parr[p * 3 + 1] = (Math.random() - 0.5) * 14;
      parr[p * 3 + 2] = -30 + Math.random() * 36;
    }
    var pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(parr, 3));
    var motes = new THREE.Points(pgeo, new THREE.PointsMaterial({
      color: 0xd9a96c, size: 0.045, transparent: true,
      opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    scene.add(motes);

    /* --- state ------------------------------------------------------*/
    var state = {
      progress: 0,     // 0 → 1 across the hero scroll
      pointer: { x: 0, y: 0 },
      smooth: { x: 0, y: 0 },
      visible: true,
      running: false
    };

    var clock = new THREE.Clock();

    function resize() {
      var w = canvas.clientWidth || canvas.offsetWidth || global.innerWidth;
      var h = canvas.clientHeight || canvas.offsetHeight || global.innerHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    function frame() {
      if (!state.running) return;
      global.requestAnimationFrame(frame);
      if (!state.visible) return;

      var dt = Math.min(clock.getDelta(), 0.05);
      var t = clock.elapsedTime;

      state.smooth.x = lerp(state.smooth.x, state.pointer.x, 0.055);
      state.smooth.y = lerp(state.smooth.y, state.pointer.y, 0.055);

      // scroll flies the camera forward, past the lead bean and into the drift
      camera.position.z = lerp(9, -6.5, state.progress);
      camera.position.x = state.smooth.x * 1.5;
      camera.position.y = state.smooth.y * -0.95 + state.progress * 0.5;
      camera.lookAt(state.smooth.x * 0.5, state.smooth.y * -0.3, camera.position.z - 8);

      for (var i = 0; i < beans.length; i++) {
        var b = beans[i], u = b.userData;
        if (reduced) {
          b.rotation.y += u.spin.y * dt * 0.25;
        } else {
          b.rotation.x += u.spin.x * dt;
          b.rotation.y += u.spin.y * dt;
          b.rotation.z += u.spin.z * dt;
          b.position.y = u.baseY + Math.sin(t * 0.55 + u.bob) * u.bobAmp;
        }
        if (u.lead) {
          // the hero bean opens up to the pointer a little
          b.rotation.y += (state.smooth.x * 0.5 - b.rotation.y % 6.28) * 0.0009;
          b.scale.setScalar(0.92 - state.progress * 0.26);
        }
      }

      if (!reduced) {
        motes.rotation.y = t * 0.014;
        motes.position.z = (t * 0.32) % 6;
      }

      cherry.intensity = 20 + Math.sin(t * 1.2) * 6;
      renderer.render(scene, camera);
    }

    function start() {
      if (state.running) return;
      state.running = true;
      clock.start();
      global.requestAnimationFrame(frame);
    }

    resize();
    start();

    return {
      resize: resize,
      setProgress: function (v) { state.progress = Math.max(0, Math.min(1, v)); },
      setPointer: function (x, y) { state.pointer.x = x; state.pointer.y = y; },
      setVisible: function (v) { state.visible = !!v; },
      dispose: function () { state.running = false; renderer.dispose(); }
    };
  }

  /* ================================================================= */
  /* ROAST LAB — one bean, four finishes, drag to spin                 */
  /* ================================================================= */
  function createLab(canvas) {
    if (!canvas) return null;

    var renderer = makeRenderer(canvas);
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    camera.position.set(0, 0, 8.2);

    scene.add(new THREE.AmbientLight(0x4e382a, 1.05));

    var key = new THREE.DirectionalLight(0xffe0b4, 3.8);
    key.position.set(-6, 5, 7);
    scene.add(key);

    var fill = new THREE.PointLight(0xd9a96c, 22, 24, 2);
    fill.position.set(5, -2, 4);
    scene.add(fill);

    var back = new THREE.PointLight(0xc33c2b, 26, 22, 2);
    back.position.set(1.5, 3.5, -5);
    scene.add(back);

    var mat = new THREE.MeshStandardMaterial({
      color: 0x7a4a2e,
      roughness: 1,
      metalness: 0.03,
      roughnessMap: sharedRough(),
      bumpMap: sharedNoise(),
      bumpScale: 0.02
    });

    var bean = new THREE.Mesh(sharedGeo(global.innerWidth < 760 ? 56 : 76), mat);
    bean.scale.setScalar(1.0);
    bean.position.x = global.innerWidth < 860 ? 0 : 0.35;
    bean.rotation.set(0.22, -0.5, 0.12);
    scene.add(bean);

    // a soft ring of smaller beans orbiting behind it
    var orbit = new THREE.Group();
    for (var i = 0; i < 9; i++) {
      var om = new THREE.Mesh(sharedGeo(26), mat.clone());
      var a = (i / 9) * Math.PI * 2;
      om.position.set(Math.cos(a) * 3.4 + 0.35, Math.sin(a) * 2.2, -3 - Math.random() * 3);
      om.scale.setScalar(0.28 + Math.random() * 0.2);
      om.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      orbit.add(om);
    }
    scene.add(orbit);

    var state = {
      colour: new THREE.Color(0x7a4a2e),
      target: new THREE.Color(0x7a4a2e),
      rough: 0.58, roughTarget: 0.58,
      drag: 0, dragTarget: 0,
      tiltTarget: 0, tilt: 0,
      visible: false, running: false
    };

    var clock = new THREE.Clock();

    function resize() {
      var w = canvas.clientWidth || canvas.offsetWidth || global.innerWidth;
      var h = canvas.clientHeight || canvas.offsetHeight || global.innerHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    function frame() {
      if (!state.running) return;
      global.requestAnimationFrame(frame);
      if (!state.visible) return;

      var dt = Math.min(clock.getDelta(), 0.05);

      state.colour.lerp(state.target, 0.08);
      state.rough += (state.roughTarget - state.rough) * 0.08;
      mat.color.copy(state.colour);
      // the map already keeps things matte, so the slider only nudges the base
      mat.roughness = 0.72 + state.rough * 0.28;
      for (var i = 0; i < orbit.children.length; i++) {
        orbit.children[i].material.color.copy(state.colour);
        orbit.children[i].material.roughness = 0.72 + state.rough * 0.28;
        if (!reduced) orbit.children[i].rotation.y += dt * 0.25;
      }

      state.drag += (state.dragTarget - state.drag) * 0.08;
      state.tilt += (state.tiltTarget - state.tilt) * 0.06;

      if (!reduced) {
        bean.rotation.y += dt * 0.16;
        orbit.rotation.z += dt * 0.03;
      }
      bean.rotation.y += (state.dragTarget - state.drag) * 0.02;
      bean.rotation.x = 0.22 + state.tilt * 0.4;
      bean.position.y = Math.sin(clock.elapsedTime * 0.7) * (reduced ? 0 : 0.09);

      renderer.render(scene, camera);
    }

    function start() {
      if (state.running) return;
      state.running = true;
      clock.start();
      global.requestAnimationFrame(frame);
    }

    /* drag to spin */
    var dragging = false, lastX = 0;
    canvas.style.touchAction = 'pan-y';
    canvas.addEventListener('pointerdown', function (e) {
      dragging = true; lastX = e.clientX;
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (dragging) { state.dragTarget += (e.clientX - lastX) * 0.012; lastX = e.clientX; }
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      canvas.addEventListener(ev, function () { dragging = false; });
    });

    resize();
    start();

    return {
      resize: resize,
      setVisible: function (v) { state.visible = !!v; },
      setTilt: function (v) { state.tiltTarget = v; },
      setRoast: function (hex, roughness) {
        state.target.set(hex);
        if (typeof roughness === 'number') state.roughTarget = roughness;
      },
      dispose: function () { state.running = false; renderer.dispose(); }
    };
  }

  global.LattecanoScene = {
    supported: true,
    createHero: createHero,
    createLab: createLab,
    beanGeometry: beanGeometry
  };
})(window);
