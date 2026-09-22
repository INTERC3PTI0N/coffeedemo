/* =====================================================================
   LATTECANO — The Chamber

   The immersive stage behind both product sections. One renderer, one
   instanced bean mesh, two modes:

     drum  — a roasting drum: beans tumble against the rotating wall and
             darken from green through first crack to the chosen roast
     card  — a product card takes over the screen, through a field of
             blanks tumbling past the camera

   Also renders the still "bean bed" images used as section art, so the
   panels and the cards are pictures of real beans rather than gradients.
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

  var SPRITE = null;
  function puffSprite() {
    if (SPRITE) return SPRITE;
    var n = 128;
    var cv = document.createElement('canvas');
    cv.width = cv.height = n;
    var ctx = cv.getContext('2d');
    var img = ctx.createImageData(n, n);
    var d = img.data;
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var u = (x / n - 0.5) * 2, v = (y / n - 0.5) * 2;
        var r = Math.sqrt(u * u + v * v);
        var a = Math.max(0, 1 - r);
        a = a * a * a;
        var k = (y * n + x) * 4;
        d[k] = d[k + 1] = d[k + 2] = 255;
        d[k + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    SPRITE = new THREE.CanvasTexture(cv);
    return SPRITE;
  }

  function beanMaterial(count) {
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      bumpMap: Beans.grainTexture(),
      bumpScale: 1.3,
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
    camera.position.set(0, 0.4, 19.5);

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

    // A roasting drum is perforated sheet, not polished metal. The holes and
    // the wear are painted into maps so the wall catches light unevenly.
    function drumSkin() {
      var n = 512;
      var cv = document.createElement('canvas');
      cv.width = cv.height = n;
      var g = cv.getContext('2d');
      g.fillStyle = '#2b2118'; g.fillRect(0, 0, n, n);

      // staggered perforations
      var step = 26;
      for (var row = 0; row * step < n + step; row++) {
        for (var cl = 0; cl * step < n + step; cl++) {
          var px = cl * step + (row % 2 ? step / 2 : 0);
          var py = row * step;
          var rg = g.createRadialGradient(px, py, 1, px, py, 7);
          rg.addColorStop(0, '#0a0705');
          rg.addColorStop(0.65, '#140e09');
          rg.addColorStop(1, 'rgba(43,33,24,0)');
          g.fillStyle = rg;
          g.beginPath(); g.arc(px, py, 7, 0, 6.29); g.fill();
        }
      }
      // scorching and scuffs
      for (var i = 0; i < 90; i++) {
        var x = Math.random() * n, y = Math.random() * n;
        var r = 12 + Math.random() * 46;
        var sg = g.createRadialGradient(x, y, 1, x, y, r);
        var warm = Math.random() > 0.5;
        sg.addColorStop(0, warm ? 'rgba(92,60,32,.30)' : 'rgba(12,8,5,.34)');
        sg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = sg;
        g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill();
      }
      var tex = new THREE.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(5, 2);
      return tex;
    }

    var skin = drumSkin();
    var shellMat = new THREE.MeshPhysicalMaterial({
      map: skin,
      bumpMap: skin,
      bumpScale: 0.06,
      roughnessMap: skin,
      color: 0x6b5744, metalness: 0.88, roughness: 0.62,
      side: THREE.DoubleSide, envMapIntensity: 1.2
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

    /* The drum alone floats in the dark. A housing, a hopper throat and a
       glowing burner slot underneath give it somewhere to be. */
    var rig = new THREE.Group();
    var caseMat = new THREE.MeshPhysicalMaterial({
      color: 0x241a12, metalness: 0.7, roughness: 0.58, envMapIntensity: 0.8 });

    var housing = new THREE.Mesh(
      new THREE.CylinderGeometry(DRUM_R + 0.75, DRUM_R + 0.75, DRUM_D + 1.5, 64, 1, true),
      new THREE.MeshPhysicalMaterial({
        color: 0x1a120c, metalness: 0.6, roughness: 0.7,
        side: THREE.BackSide, envMapIntensity: 0.5 }));
    housing.rotation.x = Math.PI / 2;
    housing.position.z = -0.6;
    rig.add(housing);

    var faceRing = new THREE.Mesh(
      new THREE.RingGeometry(DRUM_R + 0.18, DRUM_R + 1.5, 64), caseMat);
    faceRing.position.z = DRUM_D / 2 + 0.16;
    rig.add(faceRing);

    // burner slot: a bar that glows when the gas is on
    // a soft glow, not a lit rectangle
    var burnerMat = new THREE.MeshBasicMaterial({
      map: puffSprite(), color: 0xff6a24, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    var burner = new THREE.Mesh(new THREE.PlaneGeometry(DRUM_R * 2.1, 2.2), burnerMat);
    burner.position.set(0, -DRUM_R - 0.7, DRUM_D / 2 + 0.2);
    rig.add(burner);

    var legMat = caseMat;
    for (var lg = -1; lg <= 1; lg += 2) {
      var leg = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.4, 0.42), legMat);
      leg.position.set(lg * (DRUM_R * 0.62), -DRUM_R - 2.2, 0);
      rig.add(leg);
    }
    scene.add(rig);

    /* --- chaff and smoke ---------------------------------------------
       Silverskin flakes off during drying and lifts on the draught; smoke
       thickens after first crack. Both are what make a roast look hot
       rather than like beans in a spinning tube. */
    var CHAFF = 120;
    var chaffGeo = new THREE.PlaneGeometry(0.13, 0.07);
    var chaffMat = new THREE.MeshBasicMaterial({
      color: 0xd8c3a0, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    var chaff = new THREE.InstancedMesh(chaffGeo, chaffMat, CHAFF);
    chaff.frustumCulled = false;
    scene.add(chaff);

    var chaffP = [];
    for (var ci = 0; ci < CHAFF; ci++) {
      chaffP.push({
        a: Math.random() * 6.28, r: Math.random() * DRUM_R * 0.9,
        z: (Math.random() - 0.5) * DRUM_D,
        vy: 0.5 + Math.random() * 1.6,
        rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 7,
        life: Math.random()
      });
    }

    var SMOKE = 46;
    var smokeMat = new THREE.MeshBasicMaterial({
      map: puffSprite(), transparent: true, opacity: 0,
      depthWrite: false, toneMapped: false, color: 0x8d8073 });
    var smoke = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), smokeMat, SMOKE);
    smoke.frustumCulled = false;
    smoke.renderOrder = 2;
    scene.add(smoke);

    var smokeP = [];
    for (var si = 0; si < SMOKE; si++) {
      smokeP.push({
        x: (Math.random() - 0.5) * DRUM_R * 1.3,
        y: -1 + Math.random() * 2,
        z: DRUM_D * 0.5 + Math.random() * 2,
        vy: 0.7 + Math.random() * 1.1,
        size: 1.6 + Math.random() * 3.2,
        rot: Math.random() * 6.28,
        life: Math.random()
      });
    }

    /* --- the specimen -------------------------------------------------
       One bean of the chosen roast, at a size you can actually look at.
       Not instanced: it gets the highest detail geometry and its own
       material, because this is the only view where the surface is the
       whole point. */
    var specMat = new THREE.MeshPhysicalMaterial({
      color: 0x6e3e1d,
      vertexColors: true,
      bumpMap: Beans.grainTexture(),
      bumpScale: 1.9,
      roughnessMap: Beans.matteTexture(),
      roughness: 0.94,
      metalness: 0.0,
      clearcoat: 0.2,
      clearcoatRoughness: 0.58,
      envMapIntensity: 1.0
    });
    var specimen = new THREE.Mesh(Beans.beanGeometry(120, 3), specMat);
    specimen.scale.setScalar(2.35);
    specimen.visible = false;
    scene.add(specimen);

    var specDrag = 0, specDragTarget = 0;

    /* --- card mode ----------------------------------------------------
       Clicking a card in the collection drops you into the middle of a
       deck of them. The one you picked comes out of the depth spinning
       and settles face-on; the rest are blanks, tumbling past the camera
       so the space around it reads as deep rather than as a backdrop.

       The card itself is built by the collection's own module — same
       geometry, same artwork, same glossy studio band — in this
       renderer, because a texture cannot cross WebGL contexts. */
    var deck = new THREE.Group();
    deck.visible = false;
    scene.add(deck);

    var hero = null;                 // the card that was clicked
    var blanks = [];
    var cardDrag = 0, cardDragTarget = 0;
    var cardBuilt = {};              // product name → built card

    function seedBlanks() {
      if (blanks.length || !global.LattecanoCards ||
          !global.LattecanoCards.supported) return;

      var geo = global.LattecanoCards.slabGeometry();
      var n = global.innerWidth < 760 ? 12 : 22;
      for (var i = 0; i < n; i++) {
        var m = global.LattecanoCards.blankMaterial();
        m.color.setHex(0x0d0a07);
        m.envMapIntensity = 1.1;
        m.transparent = true;
        var mesh = new THREE.Mesh(geo, m);
        mesh.scale.setScalar(2.2 + Math.random() * 1.8);
        deck.add(mesh);
        blanks.push({
          mesh: mesh, mat: m,
          // on a ring, not a disc — see the splay in stepCard
          a: Math.random() * Math.PI * 2,
          r: 5.5 + Math.random() * 5.5,
          y: (Math.random() - 0.5) * 4,
          z: -40 + Math.random() * 50,
          spin: (Math.random() - 0.5) * 0.5,
          tilt: (Math.random() - 0.5) * 0.7,
          phase: Math.random() * 6.28,
          rate: 2.6 + Math.random() * 3.4
        });
      }
    }

    function prepareCard(product, bedURL) {
      if (!global.LattecanoCards || !global.LattecanoCards.supported) return false;
      seedBlanks();

      if (hero) hero.group.visible = false;

      var built = cardBuilt[product.name];
      if (!built) {
        built = global.LattecanoCards.build(product, bedURL);
        /* The cards carry their own environment — one bright band, which
           is what rakes a hard highlight across a face as it turns. The
           chamber's own env map is a sky, and gives them nothing. */
        built.setEnv(cardEnv());
        built.group.scale.setScalar(4.6);
        deck.add(built.group);
        cardBuilt[product.name] = built;
      } else if (bedURL) {
        built.setBed(bedURL);
      }

      hero = built;
      hero.group.visible = true;
      cardDrag = cardDragTarget = 0;
      st.cardIn = 0;
      return true;
    }

    var CARD_ENV = null;
    function cardEnv() {
      if (!CARD_ENV) CARD_ENV = global.LattecanoCards.studio(renderer);
      return CARD_ENV;
    }

    function stepCard(dt) {
      var t = clock.elapsedTime;
      var p = st.cardIn;                        // 0 off-stage → 1 settled

      deck.visible = true;

      /* On a narrow screen the docket hangs down over most of the window,
         so the card is smaller and sits in the band left under it. Both
         at full size is not a layout a phone has room for. */
      var narrow = camera.aspect < 1.15;
      var fit = narrow ? 2.0 : 4.6;
      var lift = narrow ? -3.5 : 0;

      if (hero) {
        var g = hero.group;

        /* The arrival: it comes out of the depth already spinning, and
           the spin unwinds as it slows — two and a half turns, so the
           back and its tasting notes pass the camera on the way in. */
        var ease = 1 - Math.pow(1 - p, 3);
        g.position.z = lerp(-26, 0, ease);
        g.position.y = lerp(lift - 1.6, lift, ease) +
                       (reduced ? 0 : Math.sin(t * 0.55) * 0.16 * p);
        g.scale.setScalar(fit * (0.34 + 0.66 * ease));

        cardDrag += (cardDragTarget - cardDrag) * (1 - Math.pow(0.86, dt * 60));

        g.rotation.y = (1 - ease) * Math.PI * 5 + cardDrag +
                       (reduced ? 0 : Math.sin(t * 0.34) * 0.20 * p);
        g.rotation.x = (1 - ease) * 0.55 +
                       (reduced ? 0 : Math.sin(t * 0.27) * 0.07 * p);
        g.rotation.z = (1 - ease) * -0.4 + (1 - p) * 0.1;
      }

      // the field drifts toward the camera and recycles behind it
      for (var i = 0; i < blanks.length; i++) {
        var b = blanks[i];
        if (!reduced) {
          b.z += b.rate * dt * (0.35 + p * 0.65);
          if (b.z > 13) { b.z = -40; b.a = Math.random() * Math.PI * 2; }
        }

        /* Behind the hero the ring keeps its radius, so the depth stays
           populated; from just behind it forward the ring splays, so the
           near ones leave the frame at its edges. On a fixed radius they
           would sweep straight across the middle, and the one thing this
           view cannot afford is something crossing in front of the card
           you asked to see. */
        var splay = 1 + Math.max(0, b.z + 2) * 0.17;
        var spread = (0.55 + p * 0.45) * splay;
        b.mesh.position.set(Math.cos(b.a) * b.r * spread,
                            Math.sin(b.a) * b.r * 0.62 * spread + b.y + lift * 0.5,
                            b.z);
        b.mesh.rotation.set(
          b.tilt + (reduced ? 0 : Math.sin(t * 0.3 + b.phase) * 0.5),
          (reduced ? 0 : t * b.spin) + b.phase,
          (reduced ? 0 : Math.cos(t * 0.22 + b.phase) * 0.35)
        );
        // fade in out of the dark, and back out before they reach the lens
        b.mat.opacity = clamp((b.z + 40) / 12, 0, 1) *
                        clamp((13 - b.z) / 8, 0, 1) *
                        (0.18 + p * 0.72);
        b.mesh.visible = b.mat.opacity > 0.02;
      }
    }

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
      specReveal: 1,
      cardIn: 0,
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

      separate(1.45);
    }

    // Keep them apart. O(n²) on 150 beans is nothing, and without it the
    // heap reads as one brown mass instead of a pile of beans.
    function separate(gap) {
      var i, j, p, q;
      for (i = 0; i < COUNT; i++) {
        p = P[i];
        for (j = i + 1; j < COUNT; j++) {
          q = P[j];
          var dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
          var d2 = dx * dx + dy * dy + dz * dz;
          var min = (p.s + q.s) * gap;
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
        dummy.scale.setScalar(p.s * (p.scale === undefined ? 1 : p.scale));
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
        drum.visible = true;
        rig.visible = true;
        chaff.visible = true;
        smoke.visible = true;
        beans.visible = true;
        specimen.visible = false;

        var T = st.roastT;

        // the burner runs hard through drying and eases off after the crack
        var gas = T < 0.02 ? 0 : (T < 0.62 ? 1 : 1 - (T - 0.62) * 0.9);
        fire.intensity = gas * (16 + Math.sin(clock.elapsedTime * 9) * 5);
        burnerMat.opacity = gas * (0.42 + Math.sin(clock.elapsedTime * 11) * 0.12);

        // chaff peaks through drying, then there is none left to shed
        var chaffAmt = Math.max(0, Math.sin(clamp(T / 0.72, 0, 1) * Math.PI)) * 0.85;
        chaffMat.opacity = chaffAmt;
        if (chaffAmt > 0.01) {
          for (var c = 0; c < CHAFF; c++) {
            var cp = chaffP[c];
            cp.life += dt * 0.42;
            if (cp.life > 1) {
              cp.life = 0;
              cp.a = Math.random() * 6.28;
              cp.r = Math.random() * DRUM_R * 0.9;
            }
            var ca = cp.a + st.drumSpin * clock.elapsedTime * 0.5;
            var crad = cp.r * (1 - cp.life * 0.35);
            dummy.position.set(
              Math.cos(ca) * crad,
              Math.sin(ca) * crad + cp.life * cp.vy * 2.4,
              cp.z + cp.life * 1.2
            );
            dummy.rotation.set(0, 0, cp.rot + clock.elapsedTime * cp.spin);
            dummy.scale.setScalar(1 - cp.life * 0.3);
            dummy.updateMatrix();
            chaff.setMatrixAt(c, dummy.matrix);
          }
          chaff.instanceMatrix.needsUpdate = true;
        }

        // smoke only really arrives with first crack
        var smokeAmt = clamp((T - 0.5) / 0.35, 0, 1) * 0.30;
        smokeMat.opacity = smokeAmt;
        if (smokeAmt > 0.005) {
          for (var sm = 0; sm < SMOKE; sm++) {
            var sp = smokeP[sm];
            sp.life += dt * 0.19;
            if (sp.life > 1) {
              sp.life = 0;
              sp.x = (Math.random() - 0.5) * DRUM_R * 1.3;
            }
            dummy.position.set(
              sp.x + Math.sin(clock.elapsedTime * 0.5 + sm) * 0.7 * sp.life,
              sp.y + sp.life * sp.vy * 7,
              sp.z + sp.life * 1.6
            );
            dummy.rotation.set(0, 0, sp.rot + sp.life * 0.8);
            dummy.scale.setScalar(sp.size * (0.5 + sp.life * 1.7));
            dummy.updateMatrix();
            smoke.setMatrixAt(sm, dummy.matrix);
          }
          smoke.instanceMatrix.needsUpdate = true;
        }
      } else if (st.mode === 'specimen') {
        drum.visible = false;
        rig.visible = false;
        chaff.visible = false;
        smoke.visible = false;
        beans.visible = false;
        specimen.visible = true;
        fire.intensity = 0;

        specDrag += (specDragTarget - specDrag) * (1 - Math.pow(0.88, dt * 60));
        /* It rocks around its creased face rather than spinning: left to
           turn freely it spends half its time edge-on, which is the one
           angle where a bean looks like nothing at all. */
        specimen.rotation.y = -0.34 + specDrag +
                              (reduced ? 0 : Math.sin(clock.elapsedTime * 0.20) * 0.42);
        specimen.rotation.x = 0.14 + (reduced ? 0 : Math.sin(clock.elapsedTime * 0.3) * 0.05);
        specimen.rotation.z = 0.20;
        specimen.position.y = -0.35 + (reduced ? 0 : Math.sin(clock.elapsedTime * 0.5) * 0.09);
        specimen.scale.setScalar(1.55 * st.specReveal);
      } else if (st.mode === 'card') {
        drum.visible = false;
        rig.visible = false;
        chaff.visible = false;
        smoke.visible = false;
        beans.visible = false;
        specimen.visible = false;
        fire.intensity = 0;
        stepCard(dt);
      } else {
        specimen.visible = false;
        beans.visible = false;
        rig.visible = false;
        chaff.visible = false;
        smoke.visible = false;
        drum.visible = false;
        fire.intensity = 0;
      }
      if (st.mode !== 'card') deck.visible = false;

      if (beans.visible) {
        var sub = reduced ? 1 : 2;            // two solver steps per frame
        for (var s = 0; s < sub; s++) step(dt / sub);

        for (var i = 0; i < COUNT; i++) {
          var p = P[i];
          p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
        }
        paint();
      }

      var wide = camera.aspect > 1.15;
      var wantZ = st.mode === 'drum' ? 19.5
                : st.mode === 'specimen' ? 12.0
                : st.mode === 'card' ? 14.5 : 21.0;
      // in card mode the sheet owns the right third, so the card sits left
      var wantX = (st.mode === 'card' && wide) ? 3.4 : 0;
      camera.position.z = lerp(camera.position.z, wantZ, 1 - Math.pow(0.9, dt * 60));
      camera.position.x = lerp(camera.position.x, wantX, 1 - Math.pow(0.9, dt * 60)) +
                          Math.sin(clock.elapsedTime * 0.3) * 0.2;
      camera.lookAt(wantX, 0, 0);

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
      setMode: function (m) { st.mode = m; },
      setOpen: function (v) { st.open = !!v; },
      setTarget: function (hex) { st.target.set(hex); },
      setSpecimen: function (hex, rough, oil) {
        specMat.color.set(hex);
        specMat.roughness = 0.72 + (typeof rough === 'number' ? rough : 0.9) * 0.28;
        specMat.clearcoat = typeof oil === 'number' ? oil : 0.2;
      },
      setSpecReveal: function (v) { st.specReveal = clamp(v, 0, 1); },
      nudgeSpecimen: function (dx) { specDragTarget += dx; },

      prepareCard: prepareCard,
      setCardBed: function (name, url) {
        if (cardBuilt[name] && url) cardBuilt[name].setBed(url);
      },
      setCardPhase: function (v) { st.cardIn = clamp(v, 0, 1); },
      nudgeCard: function (dx) { cardDragTarget += dx; },
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
