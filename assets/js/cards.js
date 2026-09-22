/* =====================================================================
   LATTECANO — the collection's cards, in 3D

   The pinned horizontal scroll, the layout and the hit targets all stay
   in the DOM. This layer only draws: each frame it reads where a card's
   art box has landed on screen and puts a real 3D card there, so the
   scroll logic never has to know WebGL exists.

   The look is taken from the reference — thick rounded cards with a
   glossy finish, tumbling at their own angles, with a hard specular band
   raking across as they turn.
   ===================================================================== */
(function (global) {
  'use strict';

  var THREE = global.THREE;
  if (!THREE) { global.LattecanoCards = { supported: false }; return; }

  var reduced = global.matchMedia &&
                global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var damp = function (rate, dt) { return 1 - Math.pow(1 - rate, dt * 60); };

  /* ------------------------------------------------------------------ */
  /* A rounded card: a bevelled slab, with its faces as separate planes   */
  /* so front and back can carry different artwork.                       */
  /* ------------------------------------------------------------------ */
  function roundedShape(w, h, r) {
    var s = new THREE.Shape();
    var x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }

  var RATIO = 1.61;              // card height / width
  var FACE_Z = 0.0262;           // clear of the slab's bevel

  var SLAB = null, FACE = null;
  function slabGeometry(ratio) {
    if (SLAB) return SLAB;
    SLAB = new THREE.ExtrudeGeometry(roundedShape(1, ratio, 0.075), {
      depth: 0.034, bevelEnabled: true,
      bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2,
      curveSegments: 14
    });
    SLAB.center();
    return SLAB;
  }
  function faceGeometry(ratio) {
    if (FACE) return FACE;
    var w = 0.985, h = ratio - 0.015;
    FACE = new THREE.ShapeGeometry(roundedShape(w, h, 0.07), 14);

    /* ShapeGeometry hands back the shape's own coordinates as UVs, which
       here run -0.49..0.49 — outside the map entirely, so every face came
       out flat. Remap them onto the 0..1 the artwork is drawn in. */
    var uv = FACE.attributes.uv;
    for (var i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) / w + 0.5, uv.getY(i) / h + 0.5);
    }
    uv.needsUpdate = true;
    return FACE;
  }

  /* ------------------------------------------------------------------ */
  /* The studio: a bright band that rakes across as a card turns.        */
  /* ------------------------------------------------------------------ */
  function studio(renderer) {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = '#0a0806';
    g.fillRect(0, 0, 512, 256);

    // the band — this is what makes the gloss read as it rotates
    var band = g.createLinearGradient(0, 40, 0, 130);
    band.addColorStop(0.00, 'rgba(255,248,235,0)');
    band.addColorStop(0.42, 'rgba(255,250,240,1)');
    band.addColorStop(0.58, 'rgba(255,244,226,0.9)');
    band.addColorStop(1.00, 'rgba(255,230,200,0)');
    g.fillStyle = band;
    g.fillRect(0, 40, 512, 90);

    function blob(x, y, r, col) {
      var rg = g.createRadialGradient(x, y, 2, x, y, r);
      rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 512, 256);
    }
    blob(96, 86, 90, 'rgba(255,255,255,0.95)');
    blob(372, 96, 120, 'rgba(226,182,120,0.5)');
    blob(470, 168, 80, 'rgba(196,72,52,0.3)');

    var tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    var pm = new THREE.PMREMGenerator(renderer);
    pm.compileEquirectangularShader();
    var rt = pm.fromEquirectangular(tex);
    pm.dispose(); tex.dispose();
    return rt.texture;
  }

  /* ------------------------------------------------------------------ */
  /* Card artwork, drawn on canvas                                        */
  /* ------------------------------------------------------------------ */
  function frontTexture(product, bedURL, onReady) {
    var W = 720, H = 1160;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    var tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;

    function paint(bedImg) {
      g.fillStyle = '#17110b';
      g.fillRect(0, 0, W, H);

      if (bedImg) {
        g.globalAlpha = 0.92;
        g.drawImage(bedImg, 0, 0, W, H);
        g.globalAlpha = 1;
      }

      // the sweep: a wash of the roast colour across the lower half
      var wash = g.createLinearGradient(0, H * 0.30, W, H);
      wash.addColorStop(0, 'rgba(12,8,5,0.10)');
      wash.addColorStop(0.55, 'rgba(12,8,5,0.62)');
      wash.addColorStop(1, 'rgba(8,5,3,0.92)');
      g.fillStyle = wash;
      g.fillRect(0, 0, W, H);

      // a corner arc, the way the reference cards carry a gradient disc
      g.save();
      g.globalCompositeOperation = 'screen';
      var disc = g.createRadialGradient(W * 0.86, H * 0.16, 10, W * 0.86, H * 0.16, W * 0.72);
      disc.addColorStop(0, product.glow);
      disc.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = disc;
      g.fillRect(0, 0, W, H);
      g.restore();

      var PAPER = '#fbf5ec';

      // brand, small, top-left
      g.fillStyle = PAPER;
      g.font = '700 30px Archivo, "Helvetica Neue", Helvetica, Arial, sans-serif';
      var brand = 'LATTECANO', bx = 54, i;
      for (i = 0; i < brand.length; i++) {
        g.fillText(brand[i], bx, 76);
        bx += g.measureText(brand[i]).width + 9;
      }

      // the bean mark, top-right
      g.save();
      g.translate(W - 74, 64);
      g.strokeStyle = 'rgba(251,245,236,0.85)';
      g.lineWidth = 2.6;
      g.beginPath(); g.ellipse(0, 0, 16, 23, 0, 0, 6.283); g.stroke();
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, -20); g.bezierCurveTo(7, -8, -7, 8, 0, 20); g.stroke();
      g.restore();

      /* The name is set on two lines at most — 'TERRACE NO. 7' on three
         ran straight into the roast line below it — and the type shrinks
         until the longer of the two fits the margins. */
      var words = product.name.toUpperCase().split(' ');
      var lines = words.length > 1
        ? [words[0], words.slice(1).join(' ')]
        : [words[0]];

      g.fillStyle = PAPER;
      var size = 74;
      for (;;) {
        g.font = '700 ' + size + 'px Archivo, "Helvetica Neue", Helvetica, Arial, sans-serif';
        var widest = 0;
        for (i = 0; i < lines.length; i++) {
          widest = Math.max(widest, g.measureText(lines[i]).width);
        }
        if (widest <= W - 108 || size <= 40) break;
        size -= 3;
      }

      var y = H - 250 - (lines.length - 1) * (size * 0.08);
      for (i = 0; i < lines.length; i++) { g.fillText(lines[i], 54, y); y += size * 1.08; }

      // the roast line
      g.font = '500 25px "JetBrains Mono", ui-monospace, monospace';
      g.fillStyle = 'rgba(251,245,236,0.66)';
      g.fillText(product.roastLine, 54, H - 96);

      // a hairline rule
      g.strokeStyle = 'rgba(251,245,236,0.26)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(54, H - 138); g.lineTo(W - 54, H - 138); g.stroke();

      tex.needsUpdate = true;
      if (onReady) onReady();
    }

    /* The bean bed is rendered elsewhere and arrives late, so the face is
       painted once without it and repainted when it lands. */
    tex.setBed = function (url) {
      if (!url) { paint(null); return; }
      var img = new Image();
      img.onload = function () { paint(img); };
      img.onerror = function () { paint(null); };
      img.src = url;
    };
    tex.setBed(bedURL);
    return tex;
  }

  function backTexture(product) {
    var W = 720, H = 1160;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d');

    g.fillStyle = '#12100e';
    g.fillRect(0, 0, W, H);

    // the dark band, where a card would carry its stripe
    g.fillStyle = '#070605';
    g.fillRect(0, 150, W, 190);

    var sheen = g.createLinearGradient(0, 150, W, 340);
    sheen.addColorStop(0, 'rgba(255,255,255,0.05)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.fillStyle = sheen;
    g.fillRect(0, 150, W, 190);

    var PAPER = 'rgba(251,245,236,0.8)';
    g.fillStyle = PAPER;
    g.font = '500 24px "JetBrains Mono", ui-monospace, monospace';
    g.fillText('TASTING NOTES', 54, 430);

    g.font = '400 40px Archivo, "Helvetica Neue", Helvetica, Arial, sans-serif';
    g.fillStyle = '#fbf5ec';
    var ny = 500;
    product.notes.forEach(function (n) { g.fillText(n, 54, ny); ny += 58; });

    g.strokeStyle = 'rgba(251,245,236,0.2)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(54, ny + 28); g.lineTo(W - 54, ny + 28); g.stroke();

    g.font = '500 23px "JetBrains Mono", ui-monospace, monospace';
    g.fillStyle = 'rgba(251,245,236,0.55)';
    g.fillText(product.coord, 54, ny + 86);
    g.fillText(product.roastLine, 54, ny + 128);

    g.font = '500 21px "JetBrains Mono", ui-monospace, monospace';
    g.fillStyle = 'rgba(251,245,236,0.34)';
    g.fillText('LATTECANO · SINGLE ORIGIN', 54, H - 70);

    var tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  /* ------------------------------------------------------------------ */
  /* One card. The collection builds four of these; the takeover builds   */
  /* its own, in its own renderer, from the same parts.                   */
  /* ------------------------------------------------------------------ */
  function blankMaterial() {
    return new THREE.MeshPhysicalMaterial({
      color: 0x14100c, roughness: 0.28, metalness: 0.55,
      clearcoat: 0.9, clearcoatRoughness: 0.12, envMapIntensity: 1.5
    });
  }

  function buildCard(product, bedURL) {
    var slab = slabGeometry(RATIO);
    var face = faceGeometry(RATIO);
    var group = new THREE.Group();

    var edgeMat = blankMaterial();
    group.add(new THREE.Mesh(slab, edgeMat));

    var fTex = frontTexture(product, bedURL);
    var fMat = new THREE.MeshPhysicalMaterial({
      map: fTex,
      roughness: 0.22, metalness: 0.25,
      clearcoat: 1.0, clearcoatRoughness: 0.07,
      envMapIntensity: 1.35
    });
    /* The bevelled slab runs to ±(depth/2 + bevelThickness) = ±0.025, so
       anything nearer than that is buried inside it — which is exactly
       where the artwork was, and why every face came out plain black. */
    var front = new THREE.Mesh(face, fMat);
    front.position.z = FACE_Z;
    group.add(front);

    var bTex = backTexture(product);
    var bMat = new THREE.MeshPhysicalMaterial({
      map: bTex,
      roughness: 0.34, metalness: 0.2,
      clearcoat: 0.8, clearcoatRoughness: 0.16,
      envMapIntensity: 1.0
    });
    var back = new THREE.Mesh(face, bMat);
    back.position.z = -FACE_Z;
    back.rotation.y = Math.PI;
    group.add(back);

    return {
      group: group, frontTex: fTex,
      materials: [edgeMat, fMat, bMat],
      setEnv: function (env) {
        edgeMat.envMap = fMat.envMap = bMat.envMap = env;
        edgeMat.needsUpdate = fMat.needsUpdate = bMat.needsUpdate = true;
      },
      setBed: function (url) { fTex.setBed(url); }
    };
  }

  /* ================================================================== */
  /* THE LAYER                                                          */
  /* ================================================================== */
  function create(canvas, products, bedURLs) {
    if (!canvas) return null;

    var renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: true, alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 1.75));
    renderer.setClearAlpha(0);
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    var scene = new THREE.Scene();
    scene.environment = studio(renderer);

    var FOV = 34, DEPTH = 10;
    var camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
    camera.position.set(0, 0, DEPTH);

    scene.add(new THREE.AmbientLight(0xffe9cf, 0.55));
    var key = new THREE.DirectionalLight(0xfff4e4, 2.4);
    key.position.set(-4, 6, 8); scene.add(key);
    var rim = new THREE.DirectionalLight(0xd9a96c, 1.1);
    rim.position.set(6, -3, 4); scene.add(rim);

    var cards = [];
    products.forEach(function (prod, i) {
      var built = buildCard(prod, bedURLs && bedURLs[i]);
      var group = built.group;
      group.visible = false;
      scene.add(group);

      cards.push({
        group: group,
        frontTex: built.frontTex,
        // every card tumbles on its own clock, as in the reference
        phase: i * 1.7,
        bed: '',
        focus: 0, turn: 0, intro: 1, muted: false,
        hover: 0, hoverTarget: 0
      });
    });

    var clock = new THREE.Clock();
    var state = {
      running: false, visible: false, shownAt: 0,
      pointer: { x: 0, y: 0 }
    };
    var now = function () {
      return (global.performance && global.performance.now
              ? global.performance.now() : Date.now()) / 1000;
    };

    function resize() {
      var w = canvas.clientWidth || canvas.offsetWidth;
      var h = canvas.clientHeight || canvas.offsetHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    var TAN = Math.tan(FOV * Math.PI / 360);

    function frame() {
      if (!state.running) return;
      global.requestAnimationFrame(frame);
      if (!state.visible) return;

      /* dt is clamped so a stalled frame cannot fling the easing, but that
         also means elapsed time from it runs slow on a slow machine. The
         entrance is timed off the wall clock instead, so it takes the same
         second and a bit however badly the page is keeping up. */
      var dt = Math.min(clock.getDelta(), 0.05);
      var t = now();
      var since = t - state.shownAt;

      var cr = canvas.getBoundingClientRect();
      if (!cr.width || !cr.height) return;
      var vh = 2 * TAN * DEPTH;
      var vw = vh * (cr.width / cr.height);

      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        var host = c.host;
        if (!host) { c.group.visible = false; continue; }

        var r = host.getBoundingClientRect();
        if (c.muted || r.width < 2 ||
            r.right < -400 || r.left > cr.width + 400) {
          c.group.visible = false;
          continue;
        }
        c.group.visible = true;

        // put the card exactly where the DOM says its art box is
        var nx = (r.left + r.width / 2 - cr.left) / cr.width;
        var ny = (r.top + r.height / 2 - cr.top) / cr.height;
        c.group.position.set((nx - 0.5) * vw, -(ny - 0.5) * vh, 0);

        /* Fit the card inside the box on whichever axis is tighter. The
           CSS bag is squarer than the card, so height is usually what
           decides — and the slack left over is the room it needs to lean
           without running into the copy underneath. */
        var byW = r.width / cr.width * vw;
        var byH = (r.height / cr.height * vh) / RATIO;
        c.group.scale.setScalar(Math.min(byW, byH) * 0.97);

        /* The scroll does the turning. A card far from the middle is
           swung round far enough to show its back; as it travels toward
           the centre it turns to face you and straightens out. That is
           the reference's flip, except the reader drives it.

           `signed` is the turn as a continuous -1..1 that passes through
           zero at dead centre, so the card never jumps as it crosses the
           middle and the sign of the rotation changes. */
        var awayRaw = clamp(Math.abs(nx - 0.5) / 0.34, 0, 1);

        /* The two sides are deliberately unequal. A card still to come is
           swung right round, so what you see first is its back; it turns
           over as it reaches the middle, and then leans away rather than
           closing again on the far side. Both halves are zero at dead
           centre, so nothing jumps as a card crosses it. */
        var aim = awayRaw * awayRaw * (nx < 0.5 ? -0.34 : 0.75);

        c.hover = lerp(c.hover, c.hoverTarget, damp(0.10, dt));
        c.turn = lerp(c.turn, reduced ? 0 : aim * (1 - c.hover), damp(0.09, dt));
        c.focus = lerp(c.focus, Math.max(1 - awayRaw, c.hover), damp(0.07, dt));

        // the idle wander backs off at the extremes, so it can't push a
        // card that is already well turned over past its edge
        var loose = (1 - c.focus) * (1 - clamp(Math.abs(c.turn), 0, 1));
        var idleX = reduced ? 0 : Math.sin(t * 0.34 + c.phase) * 0.30;
        var idleY = reduced ? 0 : Math.sin(t * 0.26 + c.phase * 1.7) * 0.34;
        var idleZ = reduced ? 0 : Math.sin(t * 0.21 + c.phase * 0.7) * 0.24;

        /* The entrance: the row arrives face-away and turns over, one
           card after the next. It is the only time the back is on show,
           which is what makes the tasting notes worth printing there. */
        var p = clamp((since - i * 0.16) / 1.15, 0, 1);
        c.intro = reduced ? 0 : 1 - p * p * (3 - 2 * p);

        c.group.rotation.x = idleX * loose + (-state.pointer.y * 0.18) * c.hover;
        c.group.rotation.y = c.turn * Math.PI + idleY * loose +
                             c.hover * state.pointer.x * 0.35 +
                             c.intro * Math.PI;
        c.group.rotation.z = idleZ * loose + c.turn * 0.14 + c.intro * 0.22;

        // it lifts toward you when it settles, and arrives from further off
        c.group.position.z = c.focus * 0.55 + c.hover * 0.5 - c.intro * 1.6;
      }

      renderer.render(scene, camera);
    }

    resize();
    state.running = true;
    state.shownAt = now();
    clock.start();
    global.requestAnimationFrame(frame);

    return {
      resize: resize,
      setVisible: function (v) {
        v = !!v;
        // leaving and coming back replays the entrance
        if (v && !state.visible) { state.shownAt = now(); clock.getDelta(); }
        state.visible = v;
      },
      setPointer: function (x, y) { state.pointer.x = x; state.pointer.y = y; },
      bind: function (i, el) { if (cards[i]) cards[i].host = el; },
      setHover: function (i, v) { if (cards[i]) cards[i].hoverTarget = v ? 1 : 0; },

      /* Drop a card out of the shelf while the takeover has its own copy
         of it on screen, so the two are never up at the same time. */
      mute: function (i, v) { if (cards[i]) cards[i].muted = !!v; },

      /* Hand a card its bean bed once the still render is done; the
         takeover asks for it back, to paint its own copy of the card. */
      setBed: function (i, url) {
        if (!cards[i]) return;
        cards[i].bed = url || '';
        if (cards[i].frontTex) cards[i].frontTex.setBed(url);
      },
      bedURL: function (i) { return cards[i] ? cards[i].bed : ''; },
      unmuteAll: function () {
        cards.forEach(function (c) { c.muted = false; });
      },

      count: cards.length
    };
  }

  global.LattecanoCards = {
    supported: true,
    create: create,
    build: buildCard,
    blankMaterial: blankMaterial,
    slabGeometry: function () { return slabGeometry(RATIO); },
    studio: studio,
    ratio: RATIO
  };
})(window);
