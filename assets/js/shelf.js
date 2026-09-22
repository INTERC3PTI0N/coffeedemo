/* =====================================================================
   LATTECANO — the collection's cups

   The shelf holds the coffee itself: a single-wall paper cup, turned on
   a lathe the way a real one is drawn — out and up the outside, around
   the rolled rim, then back down the inside to the base, so the wall has
   real thickness and you can see into it. Around the middle sits a kraft
   sleeve whose flutes are geometry, not a bump map, and inside it a
   surface of coffee with a crema that follows the roast.

   The pinned horizontal scroll, the layout and the hit targets all stay
   in the DOM. This layer only draws: each frame it reads where a card's
   box has landed on screen and puts a cup there, so the scroll logic
   never has to know WebGL exists.
   ===================================================================== */
(function (global) {
  'use strict';

  var THREE = global.THREE;
  if (!THREE) { global.LattecanoShelf = { supported: false }; return; }

  var reduced = global.matchMedia &&
                global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var damp = function (rate, dt) { return 1 - Math.pow(1 - rate, dt * 60); };

  /* ------------------------------------------------------------------ */
  /* THE PROFILE                                                        */
  /*                                                                    */
  /* One continuous path in (radius, height), rim radius = 1. It climbs  */
  /* the outside, curls over the rolled rim and comes back down the      */
  /* inside — so the lathe produces a wall with thickness and an         */
  /* interior, rather than a cone you can see straight through.          */
  /* ------------------------------------------------------------------ */
  var OUTSIDE = [
    [0.000, -1.220], [0.560, -1.220], [0.615, -1.212], [0.640, -1.192],
    [0.648, -1.160], [0.663, -1.060], [0.700, -0.800], [0.748, -0.440],
    [0.800, -0.040], [0.852,  0.360], [0.900,  0.720], [0.948,  1.060],
    [0.972,  1.150], [0.990,  1.192],
    // the roll: the paper turns out, over and back under itself
    [1.020,  1.214], [1.038,  1.238], [1.032,  1.262], [1.010,  1.276],
    [0.984,  1.272], [0.968,  1.254], [0.962,  1.228], [0.958,  1.196]
  ];
  var INSIDE = [
    [0.938,  1.120], [0.918,  1.000], [0.884,  0.700], [0.836,  0.340],
    [0.784, -0.060], [0.732, -0.450], [0.684, -0.800], [0.648, -1.050],
    [0.632, -1.130], [0.600, -1.168], [0.540, -1.184], [0.000, -1.184]
  ];
  var PROFILE = OUTSIDE.concat(INSIDE);

  /* Where the interior begins, as a v coordinate. LatheGeometry sets
     v = index / (points - 1), so this is exactly the seam in the body
     map between the printed outside and the shaded inside. */
  var INSIDE_V = OUTSIDE.length / (PROFILE.length - 1);

  /* The liquid sits a little below the rim, as a filled cup does, and
     curls up where it meets the wall. Eleven points rather than six: the
     crema is a band a tenth of the radius wide, and on a coarse profile
     it interpolates into a wash instead of a rim. */
  var LIQUID = [
    [0.000, 0.8450], [0.260, 0.8455], [0.460, 0.8475], [0.600, 0.8505],
    [0.700, 0.8545], [0.775, 0.8600], [0.832, 0.8670], [0.868, 0.8755],
    [0.888, 0.8850], [0.897, 0.8950], [0.901, 0.9010]
  ];

  function outerRadius(y) {
    for (var i = 1; i < OUTSIDE.length; i++) {
      if (y <= OUTSIDE[i][1]) {
        var t = (y - OUTSIDE[i - 1][1]) /
                Math.max(1e-5, OUTSIDE[i][1] - OUTSIDE[i - 1][1]);
        return lerp(OUTSIDE[i - 1][0], OUTSIDE[i][0], clamp(t, 0, 1));
      }
    }
    return OUTSIDE[OUTSIDE.length - 1][0];
  }

  function lathe(points, segments) {
    var v = [];
    for (var i = 0; i < points.length; i++) {
      v.push(new THREE.Vector2(points[i][0], points[i][1]));
    }
    return new THREE.LatheGeometry(v, segments || 96);
  }

  /* The cup is built at rim-radius 1 and then normalised, so the shelf
     can place it by the same width-and-ratio arithmetic the cards used.
     METRICS is filled the first time the geometry is built. */
  var METRICS = { ratio: 1.2, scale: 0.48, lift: 0 };

  var BODY = null;
  function bodyGeometry() {
    if (BODY) return BODY;
    BODY = lathe(PROFILE, 108);
    BODY.computeBoundingBox();
    var b = BODY.boundingBox;
    var w = b.max.x - b.min.x, h = b.max.y - b.min.y;
    METRICS.scale = 1 / w;
    METRICS.ratio = h / w;
    METRICS.lift = -(b.max.y + b.min.y) / 2;
    return BODY;
  }

  /* ------------------------------------------------------------------ */
  /* The sleeve, corrugated for real                                     */
  /*                                                                    */
  /* A bump map would fake the flutes from straight on and lose them at  */
  /* a grazing angle, which is the angle the silhouette is read at. So   */
  /* the radius itself is modulated: the flutes are in the geometry and  */
  /* they break the outline the way a real sleeve does.                  */
  /* ------------------------------------------------------------------ */
  var FLUTES = 48;
  var SLEEVE_GEO = null;
  function sleeveGeometry() {
    if (SLEEVE_GEO) return SLEEVE_GEO;

    var pts = [];
    for (var y = -0.560; y <= 0.4201; y += 0.049) {
      pts.push([outerRadius(y) + 0.034, y]);
    }
    // six samples per flute, or the corrugation aliases into a moiré
    var geo = lathe(pts, FLUTES * 6);

    var pos = geo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), z = pos.getZ(i);
      var r = Math.hypot(x, z);
      if (r < 1e-4) continue;
      var a = Math.atan2(z, x);
      var nr = r + 0.0115 * Math.cos(a * FLUTES);
      pos.setXYZ(i, Math.cos(a) * nr, pos.getY(i), Math.sin(a) * nr);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    SLEEVE_GEO = geo;
    return SLEEVE_GEO;
  }

  /* The takeover's crowd is out of focus and behind the subject, so it
     gets a cup shape and nothing else: the outside wall only, no roll, no
     interior, and a fraction of the segments. Twenty-two copies of the
     real one is a lot of triangles to spend on blur. */
  var BLANK = null;
  function blankGeometry() {
    if (BLANK) return BLANK;
    var pts = [];
    for (var i = 0; i < OUTSIDE.length; i += 3) pts.push(OUTSIDE[i]);
    pts.push([1.020, 1.214]);
    pts.push([1.010, 1.276]);
    BLANK = lathe(pts, 30);
    return BLANK;
  }

  var LIQUID_GEO = null;
  function liquidGeometry() {
    if (!LIQUID_GEO) LIQUID_GEO = lathe(LIQUID, 96);
    return LIQUID_GEO;
  }

  /* ------------------------------------------------------------------ */
  /* THE LID                                                             */
  /*                                                                    */
  /* A travel lid, in the same units as the cup: a skirt that grips down */
  /* over the rolled rim, a moulded step, then a shallow dome. Single    */
  /* surface — the wall of a real one is thinner than a pixel at this    */
  /* size, and tracing it back down doubles the geometry to draw nothing.*/
  /* ------------------------------------------------------------------ */
  var LID = [
    [1.062, 1.150], [1.086, 1.176], [1.089, 1.236], [1.076, 1.288],
    [1.052, 1.316], [1.006, 1.334], [0.946, 1.346],
    // the moulded step the lid is stacked by
    [0.938, 1.368], [0.906, 1.380], [0.878, 1.386],
    // the dome
    [0.760, 1.408], [0.560, 1.432], [0.320, 1.448], [0.000, 1.454]
  ];
  var LID_TOP = 1.454;

  var LID_GEO = null;
  function lidGeometry() {
    if (!LID_GEO) LID_GEO = lathe(LID, 96);
    return LID_GEO;
  }

  /* The sip hole, and the tab beside it. A hole cut through a lathe is a
     lot of work for something read at this size; a dark disc laid on the
     dome and a raised lip beside it say the same thing. */
  function buildLid() {
    var group = new THREE.Group();

    var shellMat = new THREE.MeshPhysicalMaterial({
      color: 0x17120f, roughness: 0.46, metalness: 0.05,
      clearcoat: 0.5, clearcoatRoughness: 0.32,
      envMapIntensity: 0.75, side: THREE.DoubleSide
    });
    group.add(new THREE.Mesh(lidGeometry(), shellMat));

    // the concentric moulding that runs round the dome
    var ringMat = new THREE.MeshPhysicalMaterial({
      color: 0x1b1512, roughness: 0.5, metalness: 0.05, clearcoat: 0.4
    });
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.017, 8, 72), ringMat);
    ring.position.y = 1.424;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    /* The sip hole goes on the side the print faces — put the two
       together and the cup has a front. That side is local +X: the shell
       is turned a quarter to bring the sleeve's u = 0.25 panel round to
       the camera, and this rides the same turn. */
    var hx = 0.60, hz = 0;

    var lip = new THREE.Mesh(
      new THREE.TorusGeometry(0.135, 0.028, 8, 30),
      new THREE.MeshPhysicalMaterial({
        color: 0x2c2420, roughness: 0.4, clearcoat: 0.5 }));
    lip.position.set(hx, 1.430, hz);
    lip.rotation.x = Math.PI / 2 - 0.16;
    lip.scale.set(1.35, 1, 1);
    group.add(lip);

    var hole = new THREE.Mesh(
      new THREE.CircleGeometry(0.125, 32),
      new THREE.MeshBasicMaterial({ color: 0x090705 }));
    hole.position.set(hx, 1.426, hz);
    hole.rotation.x = -Math.PI / 2 + 0.16;
    hole.scale.set(1.35, 1, 1);
    group.add(hole);

    return { group: group, materials: [shellMat, ringMat] };
  }

  /* ------------------------------------------------------------------ */
  /* The studio: a bright band that rakes across as the cup turns.       */
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
  /* The cup stock                                                       */
  /*                                                                    */
  /* v runs along the profile, so the map splits at INSIDE_V: below it   */
  /* is the printed outside, above it the interior, which has to go dark */
  /* toward the base because nothing in here casts an occlusion.         */
  /* ------------------------------------------------------------------ */
  var PAPER = {};
  function paperTexture(brand) {
    var key = brand ? 'brand' : 'plain';
    if (PAPER[key]) return PAPER[key];
    var W = 1024, H = 1024;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d');

    /* flipY is on, so canvas row 0 is v = 1 — the far end of the profile,
       which is the inside of the base. The interior occupies the top of
       the canvas and the outside wall the bottom. */
    var inTop = 0, inBot = (1 - INSIDE_V) * H;

    var deep = g.createLinearGradient(0, inTop, 0, inBot);
    deep.addColorStop(0.00, '#150f09');      // the base, in shadow
    deep.addColorStop(0.55, '#413426');
    deep.addColorStop(1.00, '#a0907b');      // up near the rim
    g.fillStyle = deep;
    g.fillRect(0, inTop, W, inBot);

    /* The waterline. The coffee is a separate mesh, so nothing shadows the
       wall behind it — this is the band of dark the liquid would throw,
       painted where the profile reaches the fill height. */
    var wl = inBot * 0.87;
    var line = g.createLinearGradient(0, wl - inBot * 0.16, 0, wl + inBot * 0.05);
    line.addColorStop(0.00, 'rgba(12,7,3,0)');
    line.addColorStop(0.72, 'rgba(12,7,3,0.55)');
    line.addColorStop(1.00, 'rgba(12,7,3,0.78)');
    g.fillStyle = line;
    g.fillRect(0, wl - inBot * 0.16, W, inBot * 0.21);

    // the outside: bleached board, faintly warm
    g.fillStyle = '#f4efe6';
    g.fillRect(0, inBot, W, H - inBot);

    /* The side seam, where the blank is glued. Faint: at full strength it
       reads as a stripe printed on the cup rather than a fold in it. */
    g.fillStyle = 'rgba(178,160,136,0.15)';
    g.fillRect(W * 0.5 - 5, inBot, 10, H - inBot);
    g.fillStyle = 'rgba(120,102,80,0.11)';
    g.fillRect(W * 0.5 - 6, inBot, 2, H - inBot);

    // fibre: board is never flat white
    for (var i = 0; i < 9000; i++) {
      var x = Math.random() * W, y = Math.random() * H;
      g.fillStyle = Math.random() > 0.5
        ? 'rgba(186,170,146,0.10)' : 'rgba(255,253,248,0.12)';
      g.fillRect(x, y, 1 + Math.random() * 4, 1);
    }

    /* The hero's cup is printed board rather than plain: a tone-on-tone
       repeat above the sleeve and the wordmark low on the body, both set
       barely darker than the stock so they read as printed on it rather
       than stuck to it. */
    if (brand) {
      var wallTop = inBot, wallBot = H;

      g.save();
      g.globalAlpha = 0.16;
      g.strokeStyle = '#6b5636';
      for (var bx = 0; bx < 16; bx++) {
        for (var by = 0; by < 5; by++) {
          var mx = (bx + (by % 2) * 0.5) * (W / 16);
          var my = wallTop + 26 + by * 52;
          if (my > wallBot - 30) continue;
          g.save();
          g.translate(mx, my);
          g.lineWidth = 2;
          g.beginPath(); g.ellipse(0, 0, 5.5, 8, 0, 0, 6.283); g.stroke();
          g.restore();
        }
      }
      g.restore();

      g.save();
      g.globalAlpha = 0.20;
      g.fillStyle = '#6b5636';
      g.textAlign = 'center';
      g.font = '800 44px Archivo, "Helvetica Neue", Helvetica, Arial, sans-serif';
      for (var k = 0; k < 4; k++) {
        g.fillText('LATTECANO', (k + 0.5) * (W / 4), wallBot - 96);
      }
      g.restore();
    }

    var tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    PAPER[key] = tex;
    return tex;
  }

  var PAPER_BUMP = null;
  function paperBump() {
    if (PAPER_BUMP) return PAPER_BUMP;
    var n = 256;
    var cv = document.createElement('canvas');
    cv.width = cv.height = n;
    var g = cv.getContext('2d');
    var img = g.createImageData(n, n);
    var d = img.data;
    for (var i = 0; i < n * n; i++) {
      // board tooth is fine and directional — long fibres lying flat
      var x = i % n, y = (i / n) | 0;
      var v = 128 +
              Math.sin(y * 1.9 + Math.sin(x * 0.11) * 3) * 9 +
              (Math.random() - 0.5) * 34;
      var k = i * 4;
      d[k] = d[k + 1] = d[k + 2] = clamp(v, 0, 255);
      d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    PAPER_BUMP = new THREE.CanvasTexture(cv);
    PAPER_BUMP.wrapS = PAPER_BUMP.wrapT = THREE.RepeatWrapping;
    PAPER_BUMP.repeat.set(5, 5);
    return PAPER_BUMP;
  }

  /* ------------------------------------------------------------------ */
  /* The sleeve print — one per coffee                                   */
  /* ------------------------------------------------------------------ */
  function sleeveTexture(product, brandOnly) {
    var W = 2048, H = 512;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d');

    g.fillStyle = '#d8bc8e';
    g.fillRect(0, 0, W, H);

    // kraft: flecks of unbleached pulp, and the shadow in each flute
    for (var i = 0; i < 4200; i++) {
      var fx = Math.random() * W, fy = Math.random() * H;
      g.fillStyle = Math.random() > 0.5
        ? 'rgba(126,95,52,0.16)' : 'rgba(247,232,204,0.18)';
      g.fillRect(fx, fy, 1 + Math.random() * 4, 1);
    }
    var flutePx = W / FLUTES;
    for (i = 0; i < FLUTES; i++) {
      var sh = g.createLinearGradient(i * flutePx, 0, (i + 1) * flutePx, 0);
      sh.addColorStop(0.00, 'rgba(92,66,34,0.22)');
      sh.addColorStop(0.45, 'rgba(255,240,214,0.10)');
      sh.addColorStop(1.00, 'rgba(92,66,34,0.22)');
      g.fillStyle = sh;
      g.fillRect(i * flutePx, 0, flutePx, H);
    }

    var INK = '#25170a';

    /* Letterspacing by hand — canvas letterSpacing is not dependable.
       `cx` is the centre of one wrap; the print is repeated so that
       however far the cup is turned, a whole panel faces out. */
    function line(text, cx, y, font, track, fill) {
      g.font = font;
      g.fillStyle = fill;
      g.textBaseline = 'middle';
      var widths = [], total = 0, j;
      for (j = 0; j < text.length; j++) {
        widths[j] = g.measureText(text[j]).width;
        total += widths[j] + track;
      }
      total -= track;
      var x = cx - total / 2;
      for (j = 0; j < text.length; j++) {
        g.fillText(text[j], x, y);
        x += widths[j] + track;
      }
      return total;
    }

    function panel(cx) {
      // the bean mark, set in a ruled roundel
      g.save();
      g.translate(cx, H * 0.125);
      g.strokeStyle = 'rgba(37,23,10,0.30)';
      g.lineWidth = 1.6;
      g.beginPath(); g.arc(0, 0, 40, 0, 6.283); g.stroke();
      g.strokeStyle = INK; g.lineWidth = 3;
      g.beginPath(); g.ellipse(0, 0, 16, 24, 0, 0, 6.283); g.stroke();
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(0, -21); g.bezierCurveTo(7, -8, -7, 8, 0, 21); g.stroke();
      g.restore();

      var w = line('LATTECANO', cx, H * 0.315,
        '800 56px Archivo, "Helvetica Neue", Helvetica, Arial, sans-serif',
        14, INK);

      // a double rule, the way a letterpress panel is closed off
      g.strokeStyle = 'rgba(37,23,10,0.44)';
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(cx - w / 2, H * 0.400); g.lineTo(cx + w / 2, H * 0.400);
      g.stroke();
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(cx - w / 2, H * 0.425); g.lineTo(cx + w / 2, H * 0.425);
      g.stroke();

      line(product.name.toUpperCase(), cx, H * 0.525,
        '600 38px Archivo, "Helvetica Neue", Helvetica, Arial, sans-serif',
        7, 'rgba(37,23,10,0.94)');

      line(product.roastLine, cx, H * 0.635,
        '500 21px "JetBrains Mono", ui-monospace, monospace',
        5, 'rgba(37,23,10,0.70)');

      /* The roast as five dots, filled to the stop this coffee is taken
         to. It is the one thing on the sleeve you can read at a glance
         from across a table, which is what a sleeve is for. */
      var lvl = product.roastLevel || 3;
      var gap = 26, dots = 5;
      var dx = cx - ((dots - 1) * gap) / 2;
      for (var d = 0; d < dots; d++) {
        g.beginPath();
        g.arc(dx + d * gap, H * 0.730, 6.5, 0, 6.283);
        if (d < lvl) { g.fillStyle = 'rgba(37,23,10,0.82)'; g.fill(); }
        else { g.strokeStyle = 'rgba(37,23,10,0.42)'; g.lineWidth = 1.8; g.stroke(); }
      }

      line((product.lot || '') + '  \u00B7  SINGLE ORIGIN', cx, H * 0.835,
        '500 17px "JetBrains Mono", ui-monospace, monospace',
        4, 'rgba(37,23,10,0.55)');
    }

    /* The hero's sleeve says one thing. With a lid on the cup there is no
       coffee to look at, so the print is the whole object — and a cup you
       meet before you have read a word about the coffee should carry the
       name of the house and nothing else. */
    function brandPanel(cx) {
      g.save();
      g.translate(cx, H * 0.170);
      g.strokeStyle = 'rgba(37,23,10,0.26)';
      g.lineWidth = 1.6;
      g.beginPath(); g.arc(0, 0, 46, 0, 6.283); g.stroke();
      g.strokeStyle = INK; g.lineWidth = 3.4;
      g.beginPath(); g.ellipse(0, 0, 19, 28, 0, 0, 6.283); g.stroke();
      g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(0, -25); g.bezierCurveTo(8, -9, -8, 9, 0, 25); g.stroke();
      g.restore();

      var bw = line('LATTECANO', cx, H * 0.450,
        '800 72px Archivo, "Helvetica Neue", Helvetica, Arial, sans-serif',
        18, INK);

      g.strokeStyle = 'rgba(37,23,10,0.46)';
      g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(cx - bw / 2, H * 0.560); g.lineTo(cx + bw / 2, H * 0.560);
      g.stroke();
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(cx - bw / 2, H * 0.590); g.lineTo(cx + bw / 2, H * 0.590);
      g.stroke();
    }

    if (brandOnly) {
      brandPanel(W * 0.25);
      brandPanel(W * 0.75);

      /* A micro-repeat that runs the whole way round rather than sitting
         inside a panel, so there is no seam to line up and the band reads
         as continuous however far the cup is turned. */
      g.save();
      g.font = '600 20px "JetBrains Mono", ui-monospace, monospace';
      g.fillStyle = 'rgba(37,23,10,0.46)';
      g.textAlign = 'left';
      var word = 'LATTECANO   \u00B7   ';
      var step = g.measureText(word).width;
      for (var rx = -step; rx < W + step; rx += step) {
        g.fillText(word, rx, H * 0.735);
      }
      g.restore();
      return finish();
    }

    // two wraps: one is always turned toward the reader
    panel(W * 0.25);
    panel(W * 0.75);
    return finish();

    function finish() {
      var tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      return tex;
    }
  }

  /* ------------------------------------------------------------------ */
  /* The coffee                                                          */
  /*                                                                    */
  /* Lathed, so the map runs (angle, radius): the canvas's top edge is   */
  /* the outside of the surface and its bottom the middle. Crema is a    */
  /* band along the top, which is where it collects in a real cup.       */
  /* ------------------------------------------------------------------ */
  function cremaTexture(product) {
    var W = 1024, H = 512;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d');

    var c = new THREE.Color(product.hex);
    var lvl = product.roastLevel || 3;          // 1 light … 5 dark
    // a darker roast pours a thicker, redder crema; a light one barely any
    var thick = 0.055 + lvl * 0.016;
    var foam = c.clone().lerp(new THREE.Color(0xffdcA0), 0.42 - lvl * 0.035).getStyle();
    var mid = c.clone().multiplyScalar(0.19).getStyle();

    /* Crema is a rim, not a wash: it collects against the wall and the
       rest of the surface is close to black. The very edge is darker
       still — that is the shadow the paper throws on the liquid, and it
       is what stops the surface reading as a sticker laid in the cup. */
    var band = g.createLinearGradient(0, 0, 0, H);
    band.addColorStop(0.000, '#1a0d05');
    band.addColorStop(0.022, '#2a1609');
    band.addColorStop(0.022 + thick * 0.35, foam);
    band.addColorStop(0.022 + thick, foam);
    band.addColorStop(0.10 + thick, mid);
    band.addColorStop(0.46, '#170d05');
    band.addColorStop(1.000, '#0a0402');
    g.fillStyle = band;
    g.fillRect(0, 0, W, H);

    /* Tiger striping. In this map u is the angle and v the radius, so a
       streak running out from the middle of the cup is a vertical line
       here — which is exactly how crema breaks up as it is poured. */
    g.lineCap = 'round';
    var edge = (0.022 + thick) * H;
    for (var s = 0; s < 140; s++) {
      var x = Math.random() * W;
      var top = edge * (0.15 + Math.random() * 0.7);
      var len = edge * (0.5 + Math.random() * 2.6);
      g.strokeStyle = Math.random() > 0.42
        ? 'rgba(255,224,170,' + (0.05 + Math.random() * 0.20) + ')'
        : 'rgba(26,12,4,' + (0.06 + Math.random() * 0.22) + ')';
      g.lineWidth = 2 + Math.random() * 13;
      g.beginPath();
      g.moveTo(x, top);
      g.bezierCurveTo(x + 6, top + len * 0.4, x - 6, top + len * 0.7, x, top + len);
      g.stroke();
    }

    /* And the slow swirl of the pour, which runs the other way. It is
       drawn modulo W because u wraps — a stroke that stops at the edge
       leaves a visible seam down the surface. */
    for (var w = 0; w < 18; w++) {
      var y0 = edge * 0.5 + Math.random() * H * 0.42;
      var x0 = Math.random() * W;
      var run = 200 + Math.random() * 520;
      g.strokeStyle = Math.random() > 0.5
        ? 'rgba(255,226,182,' + (0.03 + Math.random() * 0.08) + ')'
        : 'rgba(18,9,3,' + (0.05 + Math.random() * 0.14) + ')';
      g.lineWidth = 6 + Math.random() * 22;
      g.beginPath();
      for (var k = 0; k <= 14; k++) {
        var px = (x0 + (run * k) / 14) % W;
        var py = y0 + Math.sin(k * 0.55 + w) * 11;
        if (k === 0 || px < 2) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.stroke();
    }

    // micro-bubbles, packed into the crema where the foam actually is
    for (var b = 0; b < 1400; b++) {
      var bx = Math.random() * W;
      var by = edge * (0.1 + Math.pow(Math.random(), 1.6) * 2.4);
      var br = 0.6 + Math.random() * 2.3;
      g.fillStyle = 'rgba(255,240,212,' + (0.10 + Math.random() * 0.34) + ')';
      g.beginPath(); g.arc(bx, by, br, 0, 6.2832); g.fill();
      g.fillStyle = 'rgba(34,18,6,0.22)';
      g.beginPath(); g.arc(bx + br * 0.35, by + br * 0.55, br * 0.72, 0, 6.2832); g.fill();
    }

    var tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  /* ------------------------------------------------------------------ */
  /* ONE CUP                                                             */
  /* ------------------------------------------------------------------ */
  function paperMaterial(brand) {
    return new THREE.MeshPhysicalMaterial({
      map: paperTexture(brand),
      bumpMap: paperBump(),
      bumpScale: 0.55,
      color: 0xffffff,
      roughness: 0.62, metalness: 0.0,
      sheen: 0.7, sheenRoughness: 0.82, sheenColor: new THREE.Color(0xfff2dd),
      clearcoat: 0.10, clearcoatRoughness: 0.62,
      envMapIntensity: 1.0,
      side: THREE.DoubleSide
    });
  }

  function blankMaterial() {
    /* The takeover's out-of-focus crowd: cup-shaped, and nothing else.
       Dark enough to stay behind the subject, warm and glossy enough to
       catch the studio band as it passes — pure black reads as holes in
       the stage rather than as objects in it. */
    return new THREE.MeshPhysicalMaterial({
      color: 0x2b2018, roughness: 0.42, metalness: 0.12,
      clearcoat: 0.6, clearcoatRoughness: 0.34,
      envMapIntensity: 1.3, side: THREE.DoubleSide
    });
  }

  /* `opts.lid` puts a travel lid on it and drops the coffee, since there
     is then nothing to see; `opts.brandOnly` prints the house and nothing
     else, on the sleeve and on the board itself. */
  function buildCup(product, opts) {
    opts = opts || {};
    var geo = bodyGeometry();          // also fills METRICS, used just below
    var group = new THREE.Group();
    var shell = new THREE.Group();
    /* LatheGeometry starts its sweep facing the camera, so u = 0 is the
       side you are looking at and the print, which sits at u = 0.25 and
       0.75, would start off edge-on. A quarter turn brings a whole panel
       to the front. */
    shell.rotation.y = -Math.PI / 2;
    /* METRICS.lift is in profile units and everything under the shell is
       scaled, so the centring has to be scaled with it. A lid pushes the
       silhouette up, and the object drops by half of what it gained. */
    shell.position.y = (METRICS.lift - (opts.lid ? (LID_TOP - 1.276) / 2 : 0)) *
                       METRICS.scale;
    shell.scale.setScalar(METRICS.scale);
    group.add(shell);

    var bodyMat = paperMaterial(opts.brandOnly);
    shell.add(new THREE.Mesh(geo, bodyMat));

    var sleeveMat = new THREE.MeshPhysicalMaterial({
      map: sleeveTexture(product, opts.brandOnly),
      color: 0xffffff,
      roughness: 0.88, metalness: 0.0,
      sheen: 0.45, sheenRoughness: 0.9,
      envMapIntensity: 0.7,
      side: THREE.DoubleSide
    });
    shell.add(new THREE.Mesh(sleeveGeometry(), sleeveMat));

    var mats = [bodyMat, sleeveMat];

    if (opts.lid) {
      var lid = buildLid();
      shell.add(lid.group);
      mats = mats.concat(lid.materials);
    } else {
      var coffeeMat = new THREE.MeshPhysicalMaterial({
        map: cremaTexture(product),
        color: 0xffffff,
        /* Glossy, but not a mirror: at full clearcoat the studio band
           lands on the surface as one flat grey plate and the cup reads
           as plastic. A little roughness breaks it into a sheen. */
        roughness: 0.27, metalness: 0.0,
        clearcoat: 0.8, clearcoatRoughness: 0.16,
        envMapIntensity: 0.55,
        side: THREE.DoubleSide
      });
      shell.add(new THREE.Mesh(liquidGeometry(), coffeeMat));
      mats.push(coffeeMat);
    }

    return {
      group: group,
      materials: mats,
      // where the steam leaves, in the group's own units
      spout: (opts.lid ? LID_TOP : 0.90) * METRICS.scale,
      spoutR: (opts.lid ? 0.60 : 0) * METRICS.scale,
      setEnv: function (env) {
        for (var i = 0; i < mats.length; i++) {
          mats[i].envMap = env;
          mats[i].needsUpdate = true;
        }
      }
    };
  }

  /* ================================================================== */
  /* THE SHELF                                                          */
  /* ================================================================== */
  function create(canvas, products) {
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

    var cups = [];
    products.forEach(function (prod, i) {
      var built = buildCup(prod);
      var group = built.group;
      group.visible = false;
      scene.add(group);

      cups.push({
        group: group,
        mats: built.materials,
        // each one turns on its own clock, so the row is never in step
        phase: i * 1.7,
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

      for (var i = 0; i < cups.length; i++) {
        var c = cups[i];
        var host = c.host;
        if (!host) { c.group.visible = false; continue; }

        var r = host.getBoundingClientRect();
        if (c.muted || r.width < 2 ||
            r.right < -400 || r.left > cr.width + 400) {
          c.group.visible = false;
          continue;
        }
        c.group.visible = true;

        // put the cup exactly where the DOM says its box is
        var nx = (r.left + r.width / 2 - cr.left) / cr.width;
        var ny = (r.top + r.height / 2 - cr.top) / cr.height;
        c.group.position.set((nx - 0.5) * vw, -(ny - 0.5) * vh, 0);

        /* Fit inside the box on whichever axis is tighter, and leave a
           little slack — that slack is the room it needs to lean without
           running into the copy underneath. */
        var byW = r.width / cr.width * vw;
        var byH = (r.height / cr.height * vh) / METRICS.ratio;
        c.group.scale.setScalar(Math.min(byW, byH) * 0.92);

        /* The scroll does the turning, and the two sides are deliberately
           unequal: a cup still to come is turned well away, comes round
           to face you as it reaches the middle, then leans off rather
           than closing again on the far side. `aim` passes through zero
           at dead centre, so nothing jumps as a cup crosses it.

           The range is smaller than the cards': the print is what carries
           the name, and a cup turned much past a quarter takes it out of
           view. */
        var awayRaw = clamp(Math.abs(nx - 0.5) / 0.34, 0, 1);
        var aim = awayRaw * awayRaw * (nx < 0.5 ? -0.17 : 0.36);

        c.hover = lerp(c.hover, c.hoverTarget, damp(0.10, dt));
        c.turn = lerp(c.turn, reduced ? 0 : aim * (1 - c.hover), damp(0.09, dt));
        c.focus = lerp(c.focus, Math.max(1 - awayRaw, c.hover), damp(0.07, dt));

        var loose = 1 - c.focus;
        var idleX = reduced ? 0 : Math.sin(t * 0.34 + c.phase) * 0.055;
        var idleY = reduced ? 0 : Math.sin(t * 0.26 + c.phase * 1.7) * 0.26;
        var idleZ = reduced ? 0 : Math.sin(t * 0.21 + c.phase * 0.7) * 0.05;

        // the entrance: the row turns in, one cup after the next
        var p = clamp((since - i * 0.16) / 1.15, 0, 1);
        c.intro = reduced ? 0 : 1 - p * p * (3 - 2 * p);

        /* Tipping the rim toward you as a cup settles is what lets you
           see the coffee in it — positive about X brings the opening to
           face the camera. Off to the side it stands straight, so the row
           reads as a shelf rather than a row of spills. */
        var open = c.focus * 0.58 + c.hover * 0.16;

        c.group.rotation.x = open + idleX * loose +
                             (-state.pointer.y * 0.09) * c.hover;
        c.group.rotation.y = c.turn * Math.PI + idleY * loose +
                             c.hover * state.pointer.x * 0.3 +
                             c.intro * Math.PI;
        c.group.rotation.z = idleZ * loose + c.turn * 0.22 + c.intro * 0.14;

        // it lifts toward you when it settles, and arrives from further off
        c.group.position.z = c.focus * 0.55 + c.hover * 0.5 - c.intro * 1.6;

        /* It catches the light as you point at it. Brightening the
           environment rather than adding a lamp keeps the highlight
           anchored to the cup's own gloss, so it still travels across the
           board and the crema as the cup turns. */
        if (c.mats) {
          c.mats[0].envMapIntensity = 1.0 + c.hover * 0.7;
          c.mats[1].envMapIntensity = 0.7 + c.hover * 0.5;
          c.mats[2].envMapIntensity = 0.55 + c.hover * 0.4;
        }
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
      bind: function (i, el) { if (cups[i]) cups[i].host = el; },
      setHover: function (i, v) { if (cups[i]) cups[i].hoverTarget = v ? 1 : 0; },

      /* Drop a cup out of the shelf while the takeover has its own copy
         of it on screen, so the two are never up at the same time. */
      mute: function (i, v) { if (cups[i]) cups[i].muted = !!v; },
      unmuteAll: function () {
        cups.forEach(function (c) { c.muted = false; });
      },

      count: cups.length
    };
  }

  global.LattecanoShelf = {
    supported: true,
    create: create,
    build: buildCup,
    blankMaterial: blankMaterial,
    bodyGeometry: bodyGeometry,
    blankGeometry: blankGeometry,
    studio: studio,
    metrics: METRICS
  };
})(window);
