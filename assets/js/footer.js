/* =====================================================================
   LATTECANO — the footer

   The page ends in the cup. The footer is a surface of coffee stretching
   away into the dark: real geometry rippling under a low warm light,
   with the crema turning slowly on it, beans riding the swell, and steam
   coming off the near edge. Touch it and it takes the ring.

   Everything here runs forever — there is no scroll position driving it
   and no end state. It is the one part of the site that is just weather.
   ===================================================================== */
(function (global) {
  'use strict';

  var THREE = global.THREE;
  if (!THREE) { global.LattecanoFooter = { supported: false }; return; }

  var reduced = global.matchMedia &&
                global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  /* ------------------------------------------------------------------ */
  /* Noise, for the maps only — the surface itself is swell, not noise   */
  /* ------------------------------------------------------------------ */
  function hash2(x, y) {
    var h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function vnoise(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash2(xi, yi), b = hash2(xi + 1, yi);
    var c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
  }
  function fbm(x, y, oct) {
    var t = 0, amp = 0.5, f = 1;
    for (var i = 0; i < (oct || 4); i++) {
      t += vnoise(x * f, y * f) * amp;
      amp *= 0.5; f *= 2.04;
    }
    return t;
  }

  /* ------------------------------------------------------------------ */
  /* THE SWELL                                                          */
  /*                                                                    */
  /* Three travelling waves, not noise. A sine sum can be differentiated */
  /* in closed form, so the surface normals come out of the same cosines */
  /* that made the heights — and recomputing normals from the triangles  */
  /* every frame, on a grid this size, is the one thing that would make  */
  /* this expensive.                                                     */
  /* ------------------------------------------------------------------ */
  var WAVES = [
    { a: 0.052, k: 0.62, w: 0.55, dx: 0.94, dz: 0.34 },
    { a: 0.034, k: 1.05, w: -0.78, dx: -0.42, dz: 0.91 },
    { a: 0.019, k: 1.85, w: 1.12, dx: 0.70, dz: -0.71 }
  ];

  function create(canvas) {
    if (!canvas) return null;

    var renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: true, alpha: false,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 1.6));
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.setClearColor(0x090604, 1);

    var scene = new THREE.Scene();
    /* The far edge of the surface has to dissolve rather than end. Fog is
       what turns a plane into a distance. */
    scene.fog = new THREE.FogExp2(0x0b0705, 0.052);

    /* Just above the surface and pitched a touch up, so the horizon sits
       low in the frame and the copy above it is on black. A camera high
       enough to look across the whole pool puts the bright half of the
       picture exactly where the links are. */
    var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    camera.position.set(0, 0.62, 7.2);
    camera.lookAt(0, 0.80, -9);

    /* --- the light that makes it liquid ------------------------------
       One warm key, low and far, so its reflection runs back down the
       surface toward the reader as a long streak. That streak is the
       whole trick: it is what a flat dark plane needs to read as a
       liquid rather than as a floor. */
    scene.add(new THREE.AmbientLight(0x2a1c12, 0.9));
    var key = new THREE.DirectionalLight(0xffcf92, 1.5);
    key.position.set(-2.2, 2.6, -18);
    scene.add(key);
    var fill = new THREE.DirectionalLight(0xc36a3a, 0.5);
    fill.position.set(5, 3, 6);
    scene.add(fill);

    // and the glow of it, sitting on the horizon
    var sun = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 13),
      new THREE.MeshBasicMaterial({
        map: glowTexture(), transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false,
        color: 0xffb765, opacity: 0.42
      }));
    sun.position.set(-2.2, 0.15, -26);
    scene.add(sun);

    scene.environment = studio(renderer);

    /* --- the surface -------------------------------------------------- */
    var GX = 74, GZ = 46;                 // grid, not a pixel budget
    var W = 46, D = 62;
    var geo = new THREE.PlaneGeometry(W, D, GX, GZ);
    geo.rotateX(-Math.PI / 2);

    var colour = cremaTexture();
    var normal = rippleNormal();
    var surfaceMat = new THREE.MeshPhysicalMaterial({
      map: colour,
      normalMap: normal,
      /* Barely any normal at all. Coffee in a vessel this wide is almost
         flat; at anything like a water-shader strength it reads as a
         choppy sea, which is what the first pass looked like. */
      normalScale: new THREE.Vector2(0.11, 0.11),
      color: 0xffffff,
      /* Clearcoat is what made the first pass read as a misty lake: at a
         grazing angle it throws a white Fresnel sheen across everything,
         and almost all of this surface is at a grazing angle. Rougher,
         barely coated and lit by a narrow band gives one bright streak
         and black either side of it, which is what coffee looks like. */
      roughness: 0.34, metalness: 0.0,
      clearcoat: 0.22, clearcoatRoughness: 0.30,
      envMapIntensity: 0.30
    });
    var surface = new THREE.Mesh(geo, surfaceMat);
    surface.position.z = -18;
    scene.add(surface);

    var pos = geo.attributes.position;
    var nor = geo.attributes.normal;
    var base = new Float32Array(pos.count * 2);
    for (var i = 0; i < pos.count; i++) {
      base[i * 2] = pos.getX(i);
      base[i * 2 + 1] = pos.getZ(i);
    }

    /* --- rings, where the reader touches it --------------------------- */
    var RINGS = 5;
    var rings = [];
    for (i = 0; i < RINGS; i++) rings.push({ x: 0, z: 0, age: 1e9, amp: 0 });
    var ringAt = 0;

    /* --- beans riding the swell --------------------------------------- */
    var Beans = global.LattecanoBeans;
    var floaters = null, fCount = global.innerWidth < 760 ? 9 : 16;
    var fData = [];
    if (Beans && Beans.supported) {
      var bMat = new THREE.MeshPhysicalMaterial({
        color: 0x5a3519,
        bumpMap: Beans.grainTexture(), bumpScale: 0.9,
        roughnessMap: Beans.matteTexture(),
        roughness: 0.88, metalness: 0.0,
        clearcoat: 0.3, clearcoatRoughness: 0.5,
        envMapIntensity: 0.9
      });
      floaters = new THREE.InstancedMesh(Beans.beanGeometry(34, 1), bMat, fCount);
      floaters.frustumCulled = false;
      floaters.position.z = -18;      // the same local space as the swell
      scene.add(floaters);
      for (i = 0; i < fCount; i++) {
        /* Close enough to read. Further out they are three pixels of
           dark on dark; up near the streak they come out as silhouettes
           riding the light, which is the only place they are worth
           drawing at all. */
        fData.push({
          x: (Math.random() - 0.5) * 13,
          z: -18 + Math.random() * 21,
          s: 0.70 + Math.random() * 0.45,
          spin: (Math.random() - 0.5) * 0.5,
          roll: Math.random() * 6.28,
          rate: 0.4 + Math.random() * 0.6
        });
      }
    }

    /* --- steam off the near edge --------------------------------------- */
    var steamMat = new THREE.MeshBasicMaterial({
      map: glowTexture(), transparent: true, opacity: 0.10,
      depthWrite: false, blending: THREE.AdditiveBlending,
      toneMapped: false, color: 0xd9c0a0
    });
    var STEAM = 12;
    var steam = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), steamMat, STEAM);
    steam.frustumCulled = false;
    scene.add(steam);
    var sData = [];
    for (i = 0; i < STEAM; i++) {
      sData.push({
        x: (Math.random() - 0.5) * 16,
        z: -14 + Math.random() * 12,
        life: Math.random(),
        size: 2.4 + Math.random() * 3.4,
        sway: (Math.random() - 0.5) * 1.6
      });
    }

    var dummy = new THREE.Object3D();
    var clock = new THREE.Clock();
    var state = { running: false, visible: false, pointer: { x: 0, y: 0 } };

    function height(x, z, t, grad) {
      var h = 0, dx = 0, dz = 0, j, wv, ph, c;
      for (j = 0; j < WAVES.length; j++) {
        wv = WAVES[j];
        ph = (x * wv.dx + z * wv.dz) * wv.k + t * wv.w;
        h += Math.sin(ph) * wv.a;
        if (grad) {
          c = Math.cos(ph) * wv.a * wv.k;
          dx += c * wv.dx;
          dz += c * wv.dz;
        }
      }
      for (j = 0; j < RINGS; j++) {
        var r = rings[j];
        if (r.age > 5.2) continue;
        var ex = x - r.x, ez = z - r.z;
        var d = Math.sqrt(ex * ex + ez * ez);
        // a ring that travels out and flattens as it goes
        var front = d - r.age * 3.1;
        if (front > 1.6 || front < -5) continue;
        var fall = Math.exp(-d * 0.16) * Math.exp(-r.age * 0.62) * r.amp;
        var p2 = front * 3.4;
        h += Math.sin(p2) * fall;
        if (grad && d > 1e-4) {
          var c2 = Math.cos(p2) * fall * 3.4;
          dx += c2 * (ex / d);
          dz += c2 * (ez / d);
        }
      }
      if (grad) { grad[0] = dx; grad[1] = dz; }
      return h;
    }

    var grad = [0, 0];

    function resize() {
      var w = canvas.clientWidth || canvas.offsetWidth;
      var h = canvas.clientHeight || canvas.offsetHeight;
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
      var i, j;

      for (j = 0; j < RINGS; j++) rings[j].age += dt;

      // the swell, and the normals that come out of the same cosines
      for (i = 0; i < pos.count; i++) {
        var x = base[i * 2], z = base[i * 2 + 1];
        var h = reduced ? 0 : height(x, z, t, grad);
        pos.setY(i, h);
        if (reduced) { nor.setXYZ(i, 0, 1, 0); continue; }
        var nx = -grad[0], nz = -grad[1];
        var len = Math.sqrt(nx * nx + 1 + nz * nz);
        nor.setXYZ(i, nx / len, 1 / len, nz / len);
      }
      pos.needsUpdate = true;
      nor.needsUpdate = true;

      /* The crema turns rather than scrolls. A map sliding in one
         direction reads as a conveyor belt; rotating it slowly, against
         a colour that drifts the other way, never repeats. */
      if (!reduced) {
        colour.rotation = t * 0.012;
        colour.offset.set(Math.sin(t * 0.021) * 0.06, t * 0.004);
        normal.rotation = -t * 0.019;
        normal.offset.set(t * 0.007, Math.cos(t * 0.017) * 0.05);
      }

      // beans ride it, and come in from the dark
      if (floaters) {
        for (i = 0; i < fCount; i++) {
          var f = fData[i];
          if (!reduced) {
            f.z += f.rate * dt;
            if (f.z > 4) { f.z = -18; f.x = (Math.random() - 0.5) * 13; }
          }
          var fh = reduced ? 0 : height(f.x, f.z, t, grad);
          dummy.position.set(f.x, fh + 0.02, f.z);
          dummy.rotation.set(
            1.35 + (reduced ? 0 : -grad[1] * 0.9),
            f.roll + (reduced ? 0 : t * f.spin),
            (reduced ? 0 : grad[0] * 0.9)
          );
          dummy.scale.set(f.s, f.s * 0.45, f.s);   // half of it is under
          dummy.updateMatrix();
          floaters.setMatrixAt(i, dummy.matrix);
        }
        floaters.instanceMatrix.needsUpdate = true;
      }

      // steam
      steamMat.opacity = reduced ? 0.05 : 0.11;
      for (i = 0; i < STEAM; i++) {
        var sp = sData[i];
        if (!reduced) {
          sp.life += dt * 0.055;
          if (sp.life > 1) { sp.life -= 1; sp.x = (Math.random() - 0.5) * 16; }
        }
        dummy.position.set(
          sp.x + Math.sin(t * 0.3 + i) * 1.3 * sp.life * sp.sway,
          sp.life * 3.4 - 0.2,
          sp.z + sp.life * 2
        );
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(sp.size * (0.5 + sp.life * 1.6));
        dummy.updateMatrix();
        steam.setMatrixAt(i, dummy.matrix);
      }
      steam.instanceMatrix.needsUpdate = true;

      // and the eye drifts, because nothing in a cup is ever quite still
      if (!reduced) {
        camera.position.x = Math.sin(t * 0.055) * 0.55 + state.pointer.x * 0.35;
        camera.position.y = 0.62 + Math.sin(t * 0.083) * 0.04 - state.pointer.y * 0.07;
        camera.lookAt(state.pointer.x * 0.5, 0.80, -9);
      }

      renderer.render(scene, camera);
    }

    /* Where a point on the screen lands on the coffee. The surface is
       flat enough at this distance that a mathematical plane is a better
       answer than a raycast against 7,000 rippling triangles. */
    var ray = new THREE.Raycaster();
    var planeY = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    var hit = new THREE.Vector3();
    var ndc = new THREE.Vector2();

    function ringAtScreen(nx, ny, amp) {
      ndc.set(nx * 2 - 1, -(ny * 2 - 1));
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(planeY, hit)) return;
      var r = rings[ringAt % RINGS];
      ringAt++;
      r.x = hit.x;
      r.z = hit.z - surface.position.z;
      r.age = 0;
      r.amp = amp;
    }

    resize();
    state.running = true;
    clock.start();
    global.requestAnimationFrame(frame);

    return {
      resize: resize,
      setVisible: function (v) {
        v = !!v;
        if (v && !state.visible) clock.getDelta();
        state.visible = v;
      },
      setPointer: function (x, y) { state.pointer.x = x; state.pointer.y = y; },
      ring: function (nx, ny, amp) {
        if (reduced) return;
        ringAtScreen(nx, ny, amp === undefined ? 0.14 : amp);
      }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Maps                                                                */
  /* ------------------------------------------------------------------ */
  function cremaTexture() {
    var N = 512;
    var cv = document.createElement('canvas');
    cv.width = cv.height = N;
    var g = cv.getContext('2d');

    g.fillStyle = '#120803';
    g.fillRect(0, 0, N, N);

    // the body of it, marbled rather than flat
    var img = g.getImageData(0, 0, N, N);
    var d = img.data;
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var v = fbm(x / N * 4.2, y / N * 4.2, 4);
        v = clamp((v - 0.34) * 2.3, 0, 1);
        v = Math.pow(v, 1.7);
        var k = (y * N + x) * 4;
        d[k] = 12 + v * 74;
        d[k + 1] = 7 + v * 46;
        d[k + 2] = 3 + v * 22;
        d[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);

    // and the bubbles that gather along the swirls
    for (var b = 0; b < 900; b++) {
      var bx = Math.random() * N, by = Math.random() * N;
      if (fbm(bx / N * 4.2, by / N * 4.2, 3) < 0.44) continue;
      var br = 0.6 + Math.random() * 2.1;
      g.fillStyle = 'rgba(214,168,112,' + (0.06 + Math.random() * 0.16) + ')';
      g.beginPath(); g.arc(bx, by, br, 0, 6.2832); g.fill();
    }

    var tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 8);
    tex.center.set(0.5, 0.5);
    tex.anisotropy = 8;
    return tex;
  }

  function rippleNormal() {
    var N = 256;
    var cv = document.createElement('canvas');
    cv.width = cv.height = N;
    var g = cv.getContext('2d');
    var img = g.createImageData(N, N);
    var d = img.data;

    function h(x, y) { return fbm(x / N * 7, y / N * 7, 3); }
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var dx = (h(x + 1, y) - h(x - 1, y)) * 5.5;
        var dy = (h(x, y + 1) - h(x, y - 1)) * 5.5;
        var l = Math.sqrt(dx * dx + dy * dy + 1);
        var k = (y * N + x) * 4;
        d[k] = Math.round((-dx / l * 0.5 + 0.5) * 255);
        d[k + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255);
        d[k + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
        d[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);

    var tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(5, 7);
    tex.center.set(0.5, 0.5);
    return tex;
  }

  var GLOW = null;
  function glowTexture() {
    if (GLOW) return GLOW;
    var N = 128;
    var cv = document.createElement('canvas');
    cv.width = cv.height = N;
    var g = cv.getContext('2d');
    var rg = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    rg.addColorStop(0.0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.3, 'rgba(255,255,255,0.42)');
    rg.addColorStop(1.0, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, N, N);
    GLOW = new THREE.CanvasTexture(cv);
    return GLOW;
  }

  /* A low warm band, so the reflection on the surface is a horizon and
     not a lamp — that band is what the streak is made of. */
  function studio(renderer) {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = '#080503';
    g.fillRect(0, 0, 512, 256);

    var band = g.createLinearGradient(0, 112, 0, 140);
    band.addColorStop(0.00, 'rgba(255,190,120,0)');
    band.addColorStop(0.45, 'rgba(255,205,145,0.9)');
    band.addColorStop(0.64, 'rgba(198,108,52,0.4)');
    band.addColorStop(1.00, 'rgba(110,52,22,0)');
    g.fillStyle = band;
    g.fillRect(0, 112, 512, 28);

    var hot = g.createRadialGradient(190, 126, 3, 190, 126, 46);
    hot.addColorStop(0, 'rgba(255,240,214,1)');
    hot.addColorStop(1, 'rgba(255,240,214,0)');
    g.fillStyle = hot;
    g.fillRect(0, 0, 512, 256);

    var tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    var pm = new THREE.PMREMGenerator(renderer);
    pm.compileEquirectangularShader();
    var rt = pm.fromEquirectangular(tex);
    pm.dispose(); tex.dispose();
    return rt.texture;
  }

  global.LattecanoFooter = { supported: true, create: create };
})(window);
