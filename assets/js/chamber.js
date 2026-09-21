/* =====================================================================
   LATTECANO — The Chamber

   The immersive stage behind both product sections. One renderer, one
   instanced bean mesh, two modes:

     drum  — a roasting drum: beans tumble against the rotating wall and
             darken from green through first crack to the chosen roast
     pour  — the bag is tipped and the beans fall into a heap

   Also renders the still "bean bed" images used as section art, so the
   panels and bags are pictures of real beans rather than gradients.
   ===================================================================== */
(function (global) {
  'use strict';

  var THREE = global.THREE;
  var Beans = global.LattecanoBeans;
  if (!THREE || !Beans || !Beans.supported) {
    global.LattecanoChamber = { supported: false };
    return;
  }

  var reduced = global.matchMedia &&
                global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  /* ------------------------------------------------------------------ */
  /* Shared lighting rig, so the stills and the stage match              */
  /* ------------------------------------------------------------------ */
  function studioEnv(renderer) {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    var g = c.getContext('2d');
    var sky = g.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0.00, '#ddc9ab');
    sky.addColorStop(0.42, '#7d6752');
    sky.addColorStop(0.52, '#2c2016');
    sky.addColorStop(1.00, '#0a0705');
    g.fillStyle = sky; g.fillRect(0, 0, 512, 256);
    function blob(x, y, r, colour) {
      var rg = g.createRadialGradient(x, y, 2, x, y, r);
      rg.addColorStop(0, colour); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 512, 256);
    }
    blob(128, 50, 120, 'rgba(255,250,242,0.98)');
    blob(368, 96, 150, 'rgba(216,182,140,0.6)');
    blob(470, 152, 96, 'rgba(184,80,58,0.22)');

    var tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    var pm = new THREE.PMREMGenerator(renderer);
    pm.compileEquirectangularShader();
    var rt = pm.fromEquirectangular(tex);
    pm.dispose(); tex.dispose();
    return rt.texture;
  }

  function beanMaterial(count) {
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      bumpMap: Beans.grainTexture(),
      bumpScale: 0.03,
      roughnessMap: Beans.matteTexture(),
      roughness: 0.94,
      metalness: 0.0,
      clearcoat: 0.18,
      clearcoatRoughness: 0.6,
      envMapIntensity: 0.9
    });
  }

  /* ================================================================== */
  /* A still life: a heap of beans, rendered once and handed back as an  */
  /* image. Used for the roast panels and the bag fronts.                */
  /* ================================================================== */
  var bedRenderer = null, bedEnv = null;

  function renderBeanBed(hex, w, h, seedOffset) {
    w = w || 720; h = h || 900;
    if (!bedRenderer) {
      bedRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      bedRenderer.setPixelRatio(1);
      if ('outputColorSpace' in bedRenderer) bedRenderer.outputColorSpace = THREE.SRGBColorSpace;
      bedRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      bedRenderer.toneMappingExposure = 1.06;
      bedEnv = studioEnv(bedRenderer);
    }
    bedRenderer.setSize(w, h, false);

    var scene = new THREE.Scene();
    scene.environment = bedEnv;

    // Near top-down, so the bed fills the frame instead of reading as a
    // heap of giant beans floating in black.
    var FOV = 40;
    var cam = new THREE.PerspectiveCamera(FOV, w / h, 0.1, 60);
    cam.position.set(0, 12, 2.4);
    cam.lookAt(0, 0, 0);

    var halfZ = 12 * Math.tan(FOV * Math.PI / 360);
    var halfX = halfZ * (w / h);

    scene.add(new THREE.AmbientLight(0xffe8cc, 0.85));
    var key = new THREE.DirectionalLight(0xfff2de, 3.0);
    key.position.set(-6, 9, 4); scene.add(key);
    var rim = new THREE.PointLight(0xd9a96c, 26, 34, 2);
    rim.position.set(7, 5, -5); scene.add(rim);

    var geo = Beans.beanGeometry(40, 2);
    var mat = beanMaterial();
    var base = new THREE.Color(hex);

    // a floor in the bean's own colour, so the gaps read as shadow between
    // beans rather than as holes through to nothing
    var floor = new THREE.Mesh(
      new THREE.PlaneGeometry(halfX * 6, halfZ * 6),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(hex).multiplyScalar(0.34), roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.9;
    scene.add(floor);

    var N = 430;
    var mesh = new THREE.InstancedMesh(geo, mat, N);
    var dummy = new THREE.Object3D();
    var col = new THREE.Color();
    var so = seedOffset || 0;

    function rnd(i, s) {
      var x = Math.sin((i + 1) * (12.9898 + s) + so * 7.13) * 43758.5453;
      return x - Math.floor(x);
    }

    for (var i = 0; i < N; i++) {
      // a couple of loose layers, spilling past the frame on every side
      dummy.position.set(
        (rnd(i, 1) - 0.5) * halfX * 2.3,
        -0.55 + rnd(i, 2) * 1.5,
        (rnd(i, 3) - 0.5) * halfZ * 2.3
      );
      dummy.rotation.set(rnd(i, 4) * 6.28, rnd(i, 5) * 6.28, rnd(i, 6) * 6.28);
      dummy.scale.setScalar(0.24 + rnd(i, 7) * 0.10);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      var v = 0.80 + rnd(i, 8) * 0.34;
      col.copy(base).multiplyScalar(v);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);

    bedRenderer.render(scene, cam);
    var url = bedRenderer.domElement.toDataURL('image/jpeg', 0.86);

    mesh.geometry = null;
    mat.dispose();
    scene.clear();
    return url;
  }

  /* ================================================================== */
  /* THE STAGE                                                          */
  /* ================================================================== */
  var stage = null;

  function buildStage(canvas) {
    var renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: true, alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 1.6));
    renderer.setClearAlpha(0);
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    var scene = new THREE.Scene();
    scene.environment = studioEnv(renderer);

    var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    camera.position.set(0, 0.4, 16.5);

    scene.add(new THREE.AmbientLight(0xffe4c4, 0.8));
    var key = new THREE.DirectionalLight(0xfff0d8, 3.0);
    key.position.set(-6, 7, 8); scene.add(key);
    var rim = new THREE.DirectionalLight(0xd9a96c, 1.5);
    rim.position.set(7, -2, -5); scene.add(rim);
    var fire = new THREE.PointLight(0xff6a2a, 0, 26, 2);   // the burner
    fire.position.set(0, -4.4, 2); scene.add(fire);

    /* --- the drum ---------------------------------------------------- */
    var DRUM_R = 4.3, DRUM_D = 2.6;
    var drum = new THREE.Group();

    var shellMat = new THREE.MeshPhysicalMaterial({
      color: 0x2b2118, metalness: 0.85, roughness: 0.44,
      side: THREE.DoubleSide, envMapIntensity: 1.1
    });
    var shell = new THREE.Mesh(
      new THREE.CylinderGeometry(DRUM_R, DRUM_R, DRUM_D, 72, 1, true), shellMat);
    shell.rotation.x = Math.PI / 2;
    drum.add(shell);

    // back plate
    var back = new THREE.Mesh(
      new THREE.CircleGeometry(DRUM_R, 72),
      new THREE.MeshPhysicalMaterial({ color: 0x1b140e, metalness: 0.8, roughness: 0.55 }));
    back.position.z = -DRUM_D / 2;
    drum.add(back);

    // the flights that lift the beans
    var flightMat = new THREE.MeshPhysicalMaterial({
      color: 0x3a2b1e, metalness: 0.8, roughness: 0.42, side: THREE.DoubleSide });
    var flights = new THREE.Group();
    for (var f = 0; f < 6; f++) {
      var fl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.15, DRUM_D * 0.94), flightMat);
      var fa = (f / 6) * Math.PI * 2;
      fl.position.set(Math.cos(fa) * (DRUM_R - 0.56), Math.sin(fa) * (DRUM_R - 0.56), 0);
      fl.rotation.z = fa + Math.PI / 2;
      flights.add(fl);
    }
    drum.add(flights);

    // a front rim so the opening reads as an opening
    var rimRing = new THREE.Mesh(
      new THREE.TorusGeometry(DRUM_R + 0.05, 0.14, 12, 80),
      new THREE.MeshPhysicalMaterial({ color: 0x4a3524, metalness: 0.9, roughness: 0.34 }));
    rimRing.position.z = DRUM_D / 2;
    drum.add(rimRing);

    scene.add(drum);

    /* --- the bag (pour mode) ------------------------------------------
       A pouch: a box whose top is pinched into a fin seal. Tipped over the
       heap so the beans visibly come out of something. */
    var bagMat = new THREE.MeshPhysicalMaterial({
      color: 0x8c6636, roughness: 0.62, metalness: 0.2,
      clearcoat: 0.22, clearcoatRoughness: 0.58, envMapIntensity: 0.85,
      side: THREE.DoubleSide
    });
    var bagGeo = (function () {
      var g = new THREE.BoxGeometry(2.1, 3.1, 1.15, 3, 8, 3);
      var pos = g.attributes.position;
      var v = new THREE.Vector3();
      for (var i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        var top = Math.max(0, (v.y - 0.55) / 1.0);      // 0 at the belly, 1 at the seal
        var k = 1 - 0.86 * Math.min(1, top);
        v.z *= k;
        v.x *= 1 + 0.12 * Math.min(1, top);
        // a soft belly so it reads as full, not as a carton
        var belly = 1 + 0.10 * Math.cos(v.y * 0.9);
        v.x *= belly; v.z *= belly;
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
      return g;
    })();

    var bag = new THREE.Group();
    var bagBody = new THREE.Mesh(bagGeo, bagMat);
    bag.add(bagBody);

    // a printed band across the belly, so it reads as packaging
    var bandMat = new THREE.MeshPhysicalMaterial({
      color: 0x15100b, roughness: 0.74, metalness: 0.1, envMapIntensity: 0.7 });
    var band = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.92, 1.22), bandMat);
    band.position.y = -0.35;
    bag.add(band);

    // the fin seal at the top
    var seal = new THREE.Mesh(
      new THREE.BoxGeometry(2.32, 0.20, 0.10),
      new THREE.MeshPhysicalMaterial({ color: 0x8a6236, roughness: 0.6, metalness: 0.3 }));
    seal.position.y = 1.62;
    bag.add(seal);

    bag.scale.setScalar(0.76);
    bag.position.set(-2.8, 2.2, 0.4);
    bag.rotation.set(0.16, 0.62, -2.15);     // tipped, mouth down and right
    bag.visible = false;
    scene.add(bag);

    /* --- the beans --------------------------------------------------- */
    var COUNT = global.innerWidth < 760 ? 90 : 150;
    var beanGeo = Beans.beanGeometry(34, 1);
    var beanMat = beanMaterial();
    var beans = new THREE.InstancedMesh(beanGeo, beanMat, COUNT);
    beans.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(beans);

    var P = [];   // particle state
    for (var i = 0; i < COUNT; i++) {
      P.push({
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        rx: Math.random() * 6.28, ry: Math.random() * 6.28, rz: Math.random() * 6.28,
        wx: (Math.random() - 0.5) * 3, wy: (Math.random() - 0.5) * 3, wz: (Math.random() - 0.5) * 3,
        s: 0.30 + Math.random() * 0.13,
        tint: 0.78 + Math.random() * 0.26
      });
    }

    var dummy = new THREE.Object3D();
    var colour = new THREE.Color();

    var st = {
      mode: 'drum',
      open: false,
      running: false,
      drumSpin: 0,
      roastT: 0,                       // 0 green → 1 fully roasted
      target: new THREE.Color(0x6e3e1d),
      pourT: 0,
      camShake: 0
    };

    // green → yellow → tan, then into whatever roast was chosen
    var GREEN = new THREE.Color(0x8a9668);
    var YELLOW = new THREE.Color(0xc9a55f);
    var TAN = new THREE.Color(0xa9773c);

    function seedDrum() {
      for (var i = 0; i < COUNT; i++) {
        var a = Math.random() * Math.PI * 2;
        var r = Math.sqrt(Math.random()) * (DRUM_R - 1.1);
        P[i].x = Math.cos(a) * r;
        P[i].y = Math.sin(a) * r - 1.0;
        P[i].z = (Math.random() - 0.5) * (DRUM_D - 0.7);
        P[i].vx = P[i].vy = P[i].vz = 0;
      }
    }

    function seedPour() {
      // queued up inside the bag, so they leave the mouth in a stream
      for (var i = 0; i < COUNT; i++) {
        P[i].x = -2.4 + (Math.random() - 0.5) * 0.8;
        P[i].y = 2.2 + (i / COUNT) * 10 + Math.random() * 0.5;
        P[i].z = 0.3 + (Math.random() - 0.5) * 0.9;
        P[i].vx = 1.6 + Math.random() * 0.8;
        P[i].vy = -1.5 - Math.random();
        P[i].vz = (Math.random() - 0.5) * 0.5;
      }
    }

    /* --- the solver -------------------------------------------------- */
    var FLOOR = -4.2;

    function step(dt) {
      var i, j, p, q;
      var omega = st.drumSpin;

      for (i = 0; i < COUNT; i++) {
        p = P[i];
        p.vy -= 16 * dt;                       // gravity

        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;

        if (st.mode === 'drum') {
          var r = Math.hypot(p.x, p.y);
          var lim = DRUM_R - p.s * 1.5;
          if (r > lim) {
            var nx = p.x / r, ny = p.y / r;
            p.x = nx * lim; p.y = ny * lim;
            var vn = p.vx * nx + p.vy * ny;
            p.vx -= nx * vn * 1.35;            // bounce
            p.vy -= ny * vn * 1.35;
            // the wall (and its flights) drag the bean around with it
            var tx = -ny, ty = nx;
            var vt = p.vx * tx + p.vy * ty;
            var want = omega * lim;
            p.vx += tx * (want - vt) * 0.34;
            p.vy += ty * (want - vt) * 0.34;
          }
          if (p.z < -DRUM_D / 2 + p.s) { p.z = -DRUM_D / 2 + p.s; p.vz *= -0.4; }
          if (p.z > DRUM_D / 2 - p.s) { p.z = DRUM_D / 2 - p.s; p.vz *= -0.4; }
        } else {
          if (p.y < FLOOR + p.s) {
            p.y = FLOOR + p.s;
            p.vy *= -0.24;
            p.vx *= 0.82; p.vz *= 0.82;
          }
        }

        p.vx *= 0.995; p.vy *= 0.999; p.vz *= 0.995;
      }

      // Keep them apart. O(n²) on 150 beans is nothing, and without it the
      // heap reads as one brown mass instead of a pile of beans.
      for (i = 0; i < COUNT; i++) {
        p = P[i];
        for (j = i + 1; j < COUNT; j++) {
          q = P[j];
          var dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
          var d2 = dx * dx + dy * dy + dz * dz;
          var min = (p.s + q.s) * 1.45;
          if (d2 > 0.0001 && d2 < min * min) {
            var d = Math.sqrt(d2);
            var push = (min - d) / d * 0.5;
            dx *= push; dy *= push; dz *= push;
            p.x -= dx; p.y -= dy; p.z -= dz;
            q.x += dx; q.y += dy; q.z += dz;
            p.vx -= dx * 2; p.vy -= dy * 2;
            q.vx += dx * 2; q.vy += dy * 2;
          }
        }
      }
    }

    function paint() {
      // colour walks the actual roast path, not a straight fade
      var t = st.roastT;
      var c = colour;
      for (var i = 0; i < COUNT; i++) {
        var p = P[i];
        var lag = clamp(t * 1.18 - (p.tint - 0.84) * 0.35, 0, 1);
        if (lag < 0.34) c.copy(GREEN).lerp(YELLOW, lag / 0.34);
        else if (lag < 0.62) c.copy(YELLOW).lerp(TAN, (lag - 0.34) / 0.28);
        else c.copy(TAN).lerp(st.target, (lag - 0.62) / 0.38);
        c.multiplyScalar(p.tint);
        beans.setColorAt(i, c);

        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(p.rx, p.ry, p.rz);
        dummy.scale.setScalar(p.s);
        dummy.updateMatrix();
        beans.setMatrixAt(i, dummy.matrix);
      }
      beans.instanceMatrix.needsUpdate = true;
      if (beans.instanceColor) beans.instanceColor.needsUpdate = true;
    }

    var clock = new THREE.Clock();

    function resize() {
      var w = canvas.clientWidth || global.innerWidth;
      var h = canvas.clientHeight || global.innerHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    function frame() {
      if (!st.running) return;
      global.requestAnimationFrame(frame);
      if (!st.open) return;

      var dt = Math.min(clock.getDelta(), 0.033);

      if (st.mode === 'drum') {
        drum.rotation.z += st.drumSpin * dt;
        flights.rotation.z = 0;
        drum.visible = true;
        fire.intensity = st.roastT > 0.02 ? 12 + Math.sin(clock.elapsedTime * 9) * 5 : 0;
      } else {
        drum.visible = false;
        bag.visible = true;
        fire.intensity = 0;
        if (!reduced) bag.rotation.z = -2.15 + Math.sin(clock.elapsedTime * 0.8) * 0.06;
      }
      if (st.mode === 'drum') bag.visible = false;

      var sub = reduced ? 1 : 2;              // two solver steps per frame
      for (var s = 0; s < sub; s++) step(dt / sub);

      for (var i = 0; i < COUNT; i++) {
        var p = P[i];
        p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
      }
      paint();

      var wantZ = st.mode === 'drum' ? 16.5 : 13.5;
      camera.position.z = lerp(camera.position.z, wantZ, 1 - Math.pow(0.9, dt * 60));
      camera.position.x = Math.sin(clock.elapsedTime * 0.3) * 0.25;
      camera.lookAt(0, st.mode === 'drum' ? 0 : -0.7, 0);

      renderer.render(scene, camera);
    }

    resize();
    st.running = true;
    clock.start();
    global.requestAnimationFrame(frame);

    return {
      state: st,
      resize: resize,
      seedDrum: seedDrum,
      seedPour: seedPour,
      setMode: function (m) { st.mode = m; },
      setOpen: function (v) { st.open = !!v; },
      setTarget: function (hex) { st.target.set(hex); },
      setBagColour: function (hex) { bagMat.color.set(hex).multiplyScalar(0.72); },
      drum: drum
    };
  }

  function getStage(canvas) {
    if (!stage) stage = buildStage(canvas);
    return stage;
  }

  global.LattecanoChamber = {
    supported: true,
    getStage: getStage,
    renderBeanBed: renderBeanBed
  };
})(window);
