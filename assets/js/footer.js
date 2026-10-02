/* =====================================================================
   ROAST LAB — the footer

   The page ends where the coffee begins: on the branch. A sprig of
   coffee reaches in from the corner with its cherries clustered at the
   nodes the way they really grow — green, yellow, orange and red on the
   same twig, because a branch never ripens all at once — and a handful
   of picked cherries hang in the air beside it, turning slowly. Push
   them and they bob away and come back; tap and they jump.

   Nothing here is a photograph. The fruit is built: an ovoid a little
   longer than it is wide, the faint seam where the two beans inside sit
   face to face, a socket where the stalk goes in and, at the other end,
   the raised disc with the dried flower at its heart that every coffee
   cherry carries. Its colour is a ripening ramp read through mottling,
   stalk-end lag, fine streaks and pale lenticels, under a waxy coat
   with a studio's softboxes reflected in it.
   ===================================================================== */
(function (global) {
  'use strict';

  var THREE = global.THREE;
  if (!THREE) { global.LattecanoFooter = { supported: false }; return; }

  var reduced = global.matchMedia &&
                global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var TAU = Math.PI * 2;
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var smooth = function (e0, e1, x) {
    var t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  var damp = function (k, dt) { return 1 - Math.pow(1 - k, dt * 60); };
  function elasticOut(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * TAU / 3) + 1;
  }

  /* A seeded generator, so the branch grows the same way every visit. */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 3D value noise. The skin is sampled on the sphere itself, so the
     pattern neither seams at the date line nor pinches at the poles. */
  function h3(x, y, z) {
    var h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^
            Math.imul(z | 0, 1440662683);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function n3(x, y, z) {
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    var xf = x - xi, yf = y - yi, zf = z - zi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    var a = h3(xi, yi, zi), b = h3(xi + 1, yi, zi);
    var c = h3(xi, yi + 1, zi), d = h3(xi + 1, yi + 1, zi);
    var e = h3(xi, yi, zi + 1), f = h3(xi + 1, yi, zi + 1);
    var g = h3(xi, yi + 1, zi + 1), k = h3(xi + 1, yi + 1, zi + 1);
    var x1 = a + (b - a) * u, x2 = c + (d - c) * u;
    var x3 = e + (f - e) * u, x4 = g + (k - g) * u;
    var y1 = x1 + (x2 - x1) * v, y2 = x3 + (x4 - x3) * v;
    return y1 + (y2 - y1) * w;
  }
  function fbm3(x, y, z, oct) {
    var t = 0, amp = 0.5, f = 1, n = 0;
    for (var i = 0; i < oct; i++) {
      t += n3(x * f + i * 17.3, y * f - i * 7.1, z * f) * amp;
      n += amp; amp *= 0.5; f *= 2.03;
    }
    return t / n;
  }

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /* ------------------------------------------------------------------ */
  /* THE CHERRY                                                          */
  /* ------------------------------------------------------------------ */

  /* Half-axes: a little longer stalk-to-tip than across, and a touch
     flatter one way than the other — two beans lie face to face inside. */
  var SX = 0.47, SY = 0.55, SZ = 0.43;

  /* How far the surface sits from the centre, along one direction. theta
     runs from the stalk (0) to the blossom end (PI). */
  function cherryRadius(theta, phi, dx, dy, dz) {
    var a = Math.PI - theta;                 // distance from the blossom end
    var r = 1;
    r *= 1 + 0.035 * Math.cos(theta);        // the blossom end a shade narrower
    // the seam, faint, down both sides where the two beans meet
    r -= 0.016 * Math.exp(-Math.pow(Math.cos(phi) / 0.17, 2)) * Math.pow(Math.sin(theta), 2);
    // the socket the stalk sits in
    r -= 0.060 * Math.exp(-Math.pow(theta / 0.15, 2));
    // the disc: a low raised button ringed by a shallow groove...
    r += 0.020 * (1 - smooth(0.17, 0.26, a));
    r -= 0.012 * Math.exp(-Math.pow((a - 0.27) / 0.035, 2));
    // ...with the dried flower at its heart: a nub with a pit in it
    r += 0.034 * Math.exp(-Math.pow(a / 0.075, 2));
    r -= 0.030 * Math.exp(-Math.pow(a / 0.030, 2));
    r += 0.007 * Math.cos(5 * phi) * Math.exp(-Math.pow((a - 0.08) / 0.03, 2));
    // and enough irregularity that it was grown, not turned
    r += (n3(dx * 1.9 + 5.1, dy * 1.9 + 2.3, dz * 1.9) - 0.5) * 0.045;
    return r;
  }

  function cherryGeometry() {
    var WS = 72, HS = 60;
    var pos = [], uv = [], idx = [];
    for (var iy = 0; iy <= HS; iy++) {
      /* Rings bunch up toward both poles, where the detail is — the socket
         and the disc are a few degrees across, and an even sphere would
         spend its rings on the plain middle instead. */
      var t = iy / HS;
      var theta = (t - 0.74 * Math.sin(TAU * t) / TAU) * Math.PI;
      var st = Math.sin(theta), ct = Math.cos(theta);
      for (var ix = 0; ix <= WS; ix++) {
        var u = ix / WS, phi = u * TAU;
        var dx = -Math.cos(phi) * st, dy = ct, dz = Math.sin(phi) * st;
        var r = cherryRadius(theta, phi, dx, dy, dz);
        pos.push(dx * r * SX, dy * r * SY, dz * r * SZ);
        uv.push(u, 1 - theta / Math.PI);
      }
    }
    for (iy = 0; iy < HS; iy++) {
      for (ix = 0; ix < WS; ix++) {
        var a = iy * (WS + 1) + ix + 1, b = iy * (WS + 1) + ix;
        var c = (iy + 1) * (WS + 1) + ix, d = (iy + 1) * (WS + 1) + ix + 1;
        if (iy !== 0) idx.push(a, b, d);
        if (iy !== HS - 1) idx.push(b, c, d);
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();

    // weld the normals across the date line and at each pole
    var n = geo.attributes.normal, v = new THREE.Vector3(), w = new THREE.Vector3();
    for (iy = 0; iy <= HS; iy++) {
      var i0 = iy * (WS + 1), i1 = i0 + WS;
      v.fromBufferAttribute(n, i0).add(w.fromBufferAttribute(n, i1)).normalize();
      n.setXYZ(i0, v.x, v.y, v.z); n.setXYZ(i1, v.x, v.y, v.z);
    }
    [0, HS].forEach(function (row) {
      v.set(0, 0, 0);
      for (var k = 0; k <= WS; k++) v.add(w.fromBufferAttribute(n, row * (WS + 1) + k));
      v.normalize();
      for (k = 0; k <= WS; k++) n.setXYZ(row * (WS + 1) + k, v.x, v.y, v.z);
    });
    return geo;
  }

  /* The stalk: short, a little flared where it meets the fruit. */
  function stalkGeometry() {
    var g = new THREE.CylinderGeometry(0.034, 0.058, 0.24, 10, 4);
    var p = g.attributes.position;
    for (var i = 0; i < p.count; i++) {
      var y = p.getY(i);
      var flare = 1 + 0.6 * smooth(-0.03, -0.12, y);
      p.setX(i, p.getX(i) * flare);
      p.setZ(i, p.getZ(i) * flare);
    }
    g.translate(0, SY * 0.93 + 0.11, 0);
    g.computeVertexNormals();
    return g;
  }

  /* Skin detail, sampled on the sphere: R mottling, G lenticels, B the
     fine streaks that run out from the stalk. Its height drives a normal
     map — the micro-relief that breaks a highlight up the way a real
     skin does. */
  function skinMaps() {
    var W = 512, H = 256;
    var c = canvas(W, H), g = c.getContext('2d');
    var img = g.createImageData(W, H), d = img.data;
    var hgt = new Float32Array(W * H);
    for (var py = 0; py < H; py++) {
      var theta = (py + 0.5) / H * Math.PI;
      var st = Math.sin(theta), ct = Math.cos(theta);
      for (var px = 0; px < W; px++) {
        var phi = (px + 0.5) / W * TAU;
        var x = -Math.cos(phi) * st, y = ct, z = Math.sin(phi) * st;
        var m = fbm3(x * 1.7 + 3.1, y * 1.7, z * 1.7, 4);
        m = clamp((m - 0.5) * 2.4 + 0.5, 0, 1);
        var l = n3(x * 34 + 11.3, y * 34 + 4.1, z * 34);
        var dot = smooth(0.80, 0.91, l) * (0.35 + 0.65 * n3(x * 4 + 2, y * 4, z * 4));
        var s = n3(x * 16 + 7, y * 2.4, z * 16);
        var k = (py * W + px) * 4;
        d[k] = m * 255; d[k + 1] = dot * 255; d[k + 2] = s * 255; d[k + 3] = 255;
        hgt[py * W + px] = n3(x * 42, y * 42, z * 42) * 0.55 +
                           n3(x * 95 + 3, y * 95, z * 95) * 0.3 + dot * 0.5;
      }
    }
    g.putImageData(img, 0, 0);
    var detail = new THREE.CanvasTexture(c);
    detail.wrapS = THREE.RepeatWrapping;
    detail.anisotropy = 4;

    var nc = canvas(W, H), ng = nc.getContext('2d');
    var nimg = ng.createImageData(W, H), nd = nimg.data;
    for (py = 0; py < H; py++) {
      var comp = 1 / Math.max(Math.sin((py + 0.5) / H * Math.PI), 0.25);
      for (px = 0; px < W; px++) {
        var xl = hgt[py * W + (px + W - 1) % W], xr = hgt[py * W + (px + 1) % W];
        var yu = hgt[Math.max(py - 1, 0) * W + px], yd = hgt[Math.min(py + 1, H - 1) * W + px];
        var gx = (xr - xl) * 1.6 * comp, gy = (yd - yu) * 1.6;
        var len = Math.sqrt(gx * gx + gy * gy + 1);
        k = (py * W + px) * 4;
        nd[k] = (-gx / len * 0.5 + 0.5) * 255;
        nd[k + 1] = (gy / len * 0.5 + 0.5) * 255;
        nd[k + 2] = (1 / len * 0.5 + 0.5) * 255;
        nd[k + 3] = 255;
      }
    }
    ng.putImageData(nimg, 0, 0);
    var normal = new THREE.CanvasTexture(nc);
    normal.wrapS = THREE.RepeatWrapping;
    return { detail: detail, normal: normal };
  }

  /* Ripening, stop by stop: green, yellow-green, amber, orange, red,
     crimson, the near-black burgundy of a cherry a day past picking. */
  var RAMP = [0x5d7d2b, 0x97a43c, 0xcf9f35, 0xd4561d, 0xae121d, 0x800a1b, 0x4e0614];

  var CHERRY_HEAD = [
    'uniform sampler2D uDetail;',
    'uniform vec3 uRamp[7];',
    'uniform float uGlow;',
    'varying float vRipe;',
    'varying float vSeed;',
    'varying vec2 vCUv;',
    'vec3 ripeColour(float r) {',
    '  r = clamp(r, 0.0, 1.0) * 6.0;',
    '  int k = int(min(floor(r), 5.0));',
    '  return mix(uRamp[k], uRamp[k + 1], smoothstep(0.0, 1.0, r - float(k)));',
    '}'
  ].join('\n');

  var CHERRY_COLOUR = [
    'vec4 skin = texture2D(uDetail, vec2(vCUv.x + vSeed, vCUv.y));',
    'float thetaC = PI * (1.0 - vCUv.y);',          // 0 at the stalk
    'float fromTip = PI * vCUv.y;',                 // 0 at the blossom end
    // the stalk end ripens last, so it lags the rest of the fruit
    'float lag = smoothstep(1.3, 0.1, thetaC);',
    'float ripe = vRipe + (skin.r - 0.5) * 0.17 + (skin.b - 0.5) * 0.06',
    '           - lag * 0.13 * (1.0 - vRipe * 0.5);',
    'vec3 col = ripeColour(ripe);',
    // pale lenticels, tiny and few
    'col = mix(col, col * 1.45 + vec3(0.05, 0.045, 0.0), skin.g * 0.4);',
    // the disc darkens toward a dried, brown-black heart
    'float disc = 1.0 - smoothstep(0.16, 0.27, fromTip);',
    'col = mix(col, col * 0.55 + vec3(0.025, 0.016, 0.004), disc * 0.6);',
    'float heart = 1.0 - smoothstep(0.03, 0.09, fromTip);',
    'col = mix(col, vec3(0.040, 0.026, 0.012), heart * 0.94);',
    // and a collar of green-brown around the stalk
    'float collar = exp(-pow(thetaC / 0.17, 2.0));',
    'col = mix(col, vec3(0.09, 0.08, 0.025), collar * 0.7);',
    'diffuseColor.rgb = col;'
  ].join('\n');

  var CHERRY_ROUGH = [
    'roughnessFactor = clamp(roughnessFactor + (skin.r - 0.5) * 0.14 + heart * 0.5 + collar * 0.25, 0.04, 1.0);'
  ].join('\n');

  /* Light that has gone into the skin and come back out at the edge: the
     thing that makes fruit look like fruit rather than painted plastic. */
  var CHERRY_GLOW = [
    'float rimC = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.2);',
    'outgoingLight += diffuseColor.rgb * uGlow * rimC;'
  ].join('\n');

  function cherryMaterial(maps) {
    var m = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.34, metalness: 0,
      clearcoat: 0.6, clearcoatRoughness: 0.14,
      normalMap: maps.normal, normalScale: new THREE.Vector2(0.28, 0.28),
      envMapIntensity: 1.0
    });
    var ramp = RAMP.map(function (h) { return new THREE.Color(h); });
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uDetail = { value: maps.detail };
      sh.uniforms.uRamp = { value: ramp };
      sh.uniforms.uGlow = { value: 0.55 };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' +
          'attribute float aRipe;\nattribute float aSeed;\n' +
          'varying float vRipe;\nvarying float vSeed;\nvarying vec2 vCUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' +
          'vRipe = aRipe; vSeed = aSeed; vCUv = uv;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + CHERRY_HEAD)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + CHERRY_COLOUR)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + CHERRY_ROUGH)
        .replace('#include <opaque_fragment>', CHERRY_GLOW + '\n#include <opaque_fragment>');
    };
    return m;
  }

  /* One instanced set of cherries (and their stalks). Two of these share
     the same buffers: the ones on the branch, and the loose ones. */
  function cherrySet(geo, stalkGeo, cMat, sMat, list) {
    var g = new THREE.BufferGeometry();
    g.setIndex(geo.index);
    g.setAttribute('position', geo.attributes.position);
    g.setAttribute('normal', geo.attributes.normal);
    g.setAttribute('uv', geo.attributes.uv);
    var ripe = new Float32Array(list.length), seed = new Float32Array(list.length);
    list.forEach(function (c, i) { ripe[i] = c.ripe; seed[i] = c.seed; });
    g.setAttribute('aRipe', new THREE.InstancedBufferAttribute(ripe, 1));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    var fruit = new THREE.InstancedMesh(g, cMat, list.length);
    var stalk = new THREE.InstancedMesh(stalkGeo, sMat, list.length);
    [fruit, stalk].forEach(function (m) {
      m.castShadow = true; m.receiveShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    });
    return { fruit: fruit, stalk: stalk };
  }

  /* ------------------------------------------------------------------ */
  /* THE LEAF                                                            */
  /*                                                                     */
  /* Coffee's leaf: elliptic, drawn out to a drip tip, a waxy upper face */
  /* with the veins pressed into it, a wavy margin, and a slight fold    */
  /* along the midrib. x runs base to tip, the face looks down +z.       */
  /* ------------------------------------------------------------------ */
  var PETIOLE = 0.09;

  function leafHalfWidth(s) {
    if (s < PETIOLE) return 0.014;
    var b = (s - PETIOLE) / (1 - PETIOLE);
    var w = 0.24 * Math.pow(Math.sin(Math.PI * Math.pow(b, 0.82)), 0.92);
    w *= 1 - 0.28 * smooth(0.72, 1, b);           // the drip tip
    return Math.max(w, 0.006);
  }

  function leafGeometry(seed) {
    var R = rng(seed);
    var SL = 40, SW = 14;
    var ph = R() * 6, amp = 0.014 + R() * 0.012;
    var pos = [], uv = [], idx = [];
    for (var i = 0; i <= SL; i++) {
      var s = i / SL, half = leafHalfWidth(s);
      for (var j = 0; j <= SW; j++) {
        var w = j / SW * 2 - 1, aw = Math.abs(w);
        var z = -aw * half * 0.34                          // folded along the midrib
              - 0.10 * s * s                               // arching away to the tip
              + amp * Math.sin(s * 27 + ph + (w > 0 ? 0 : 1.7)) * w * w   // wavy margin
              + 0.006 * Math.sin(s * 64) * aw * (1 - aw);  // puckered between the veins
        pos.push(s, w * half, z);
        uv.push(s, (w + 1) / 2);
      }
    }
    for (i = 0; i < SL; i++) {
      for (j = 0; j < SW; j++) {
        var a = i * (SW + 1) + j, b = (i + 1) * (SW + 1) + j;
        var c = i * (SW + 1) + j + 1, d = (i + 1) * (SW + 1) + j + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    var g = new THREE.BufferGeometry();
    g.setIndex(idx);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }

  /* The veins, shared by the colour and the relief: in (s, w) space, a
     midrib and eleven pairs of laterals curving forward to the margin. */
  function veinPaths(g, W, H, draw) {
    var mid = H / 2;
    draw(function () {
      g.beginPath(); g.moveTo(0, mid); g.lineTo(W, mid);
    }, 'mid');
    var R = rng(5);
    for (var k = 0; k < 11; k++) {
      var s0 = PETIOLE + 0.03 + k * 0.077 + (R() - 0.5) * 0.022;
      var reach = 0.13 + R() * 0.05;
      for (var side = -1; side <= 1; side += 2) {
        (function (s0, side, reach, bow) {
          draw(function () {
            g.beginPath();
            g.moveTo(s0 * W, mid);
            g.quadraticCurveTo((s0 + 0.035) * W, mid + side * H * bow,
                               (s0 + reach) * W, mid + side * H * 0.44);
          }, 'lat');
        })(s0 + (side > 0 ? 0 : 0.012), side, reach, 0.26 + R() * 0.08);
      }
    }
  }

  function leafMaps(young) {
    var W = 512, H = 256;
    var c = canvas(W, H), g = c.getContext('2d');
    // the blade: deep and glossy at the margins, a little lighter along the midrib
    var grd = g.createLinearGradient(0, 0, 0, H);
    var edge = young ? '#4c6a2c' : '#163a26';
    var body = young ? '#6b8a3a' : '#22502f';
    grd.addColorStop(0, edge); grd.addColorStop(0.5, body); grd.addColorStop(1, edge);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // mottle, so it is not one flat green
    var img = g.getImageData(0, 0, W, H), d = img.data;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var m = fbm3(x / W * 6, y / H * 3, young ? 9 : 2, 3) - 0.5;
        var k = (y * W + x) * 4;
        d[k] = clamp(d[k] * (1 + m * 0.35) + m * 6, 0, 255);
        d[k + 1] = clamp(d[k + 1] * (1 + m * 0.30), 0, 255);
        d[k + 2] = clamp(d[k + 2] * (1 + m * 0.35), 0, 255);
      }
    }
    g.putImageData(img, 0, 0);
    // the stalk end is all petiole
    g.fillStyle = young ? '#6f7f34' : '#3e5a2a';
    g.fillRect(0, 0, PETIOLE * W, H);
    veinPaths(g, W, H, function (path, kind) {
      path();
      g.strokeStyle = kind === 'mid'
        ? (young ? 'rgba(200,210,140,.75)' : 'rgba(156,176,104,.8)')
        : (young ? 'rgba(170,190,120,.22)' : 'rgba(120,152,96,.16)');
      g.lineWidth = kind === 'mid' ? 3.4 : 1.3;
      g.stroke();
    });
    var map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;

    // relief: veins pressed in, blade quilted up between them
    var hc = canvas(W, H), hg = hc.getContext('2d');
    hg.fillStyle = '#808080'; hg.fillRect(0, 0, W, H);
    veinPaths(hg, W, H, function (path, kind) {
      path();
      hg.strokeStyle = 'rgba(0,0,0,.18)';
      hg.lineWidth = kind === 'mid' ? 14 : 9; hg.stroke();
      path();
      hg.strokeStyle = 'rgba(0,0,0,.24)';
      hg.lineWidth = kind === 'mid' ? 6 : 3; hg.stroke();
    });
    var hd = hg.getImageData(0, 0, W, H).data;
    var nc = canvas(W, H), ng = nc.getContext('2d');
    var nimg = ng.createImageData(W, H), nd = nimg.data;
    var at = function (x, y) {
      x = clamp(x, 0, W - 1); y = clamp(y, 0, H - 1);
      return hd[(y * W + x) * 4] / 255 + (n3(x * 0.09, y * 0.09, 3) - 0.5) * 0.12;
    };
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) {
        var gx = (at(x + 1, y) - at(x - 1, y)) * 3.2;
        var gy = (at(x, y + 1) - at(x, y - 1)) * 3.2;
        var len = Math.sqrt(gx * gx + gy * gy + 1);
        k = (y * W + x) * 4;
        nd[k] = (-gx / len * 0.5 + 0.5) * 255;
        nd[k + 1] = (gy / len * 0.5 + 0.5) * 255;
        nd[k + 2] = (1 / len * 0.5 + 0.5) * 255;
        nd[k + 3] = 255;
      }
    }
    ng.putImageData(nimg, 0, 0);
    var normal = new THREE.CanvasTexture(nc);
    return { map: map, normal: normal };
  }

  function leafMaterial(young) {
    var maps = leafMaps(young);
    var m = new THREE.MeshPhysicalMaterial({
      map: maps.map, normalMap: maps.normal,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: young ? 0.48 : 0.36, metalness: 0,
      clearcoat: young ? 0.25 : 0.55, clearcoatRoughness: 0.24,
      side: THREE.DoubleSide, envMapIntensity: 0.9
    });
    // the underside is paler and matte
    m.onBeforeCompile = function (sh) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\n' +
        'if (!gl_FrontFacing) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.24, 0.12), 0.55);');
    };
    return m;
  }

  /* ------------------------------------------------------------------ */
  /* THE BRANCH                                                          */
  /* ------------------------------------------------------------------ */
  /* In its own frame: it starts at the origin (which sits off the
     canvas, in the corner) and reaches out along -x, sagging a little
     under its fruit. */
  var BRANCH_PTS = [
    [0.0, 0.0, 0.0], [-2.4, -0.55, 0.2], [-5.0, -1.45, 0.35],
    [-7.4, -2.05, 0.15], [-9.4, -2.25, -0.1], [-10.6, -2.15, -0.2]
  ];
  var NODES = [
    { t: 0.22, n: 13, ripe: [0.92, 0.86, 0.82, 0.8, 0.74, 0.7, 0.88, 0.95, 0.6, 0.78, 0.66, 0.84, 0.9],
      leaves: [{ len: 4.3, side: 1, z: -0.5, tilt: 0.35 }, { len: 3.9, side: -1, z: -0.45, tilt: -0.3 }] },
    { t: 0.50, n: 11, ripe: [0.74, 0.68, 0.56, 0.5, 0.42, 0.8, 0.62, 0.36, 0.72, 0.48, 0.84],
      leaves: [{ len: 3.7, side: 1, z: -0.4, tilt: 0.55, out: 0.55 }, { len: 3.4, side: -1, z: -0.5, tilt: -0.4, out: -0.4 }] },
    { t: 0.76, n: 8, ripe: [0.3, 0.17, 0.1, 0.24, 0.42, 0.06, 0.2, 0.5],
      leaves: [{ len: 2.9, side: 1, z: -0.35, tilt: 0.3 }, { len: 2.6, side: -1, z: -0.3, tilt: -0.35 }] },
    { t: 0.985, n: 0, ripe: [],
      leaves: [{ len: 1.35, side: 1, z: 0, tilt: 0.2, young: true }, { len: 1.1, side: -1, z: 0, tilt: -0.2, young: true }] }
  ];

  function branchGeometry(curve) {
    var TS = 120, RS = 10;
    var g = new THREE.TubeGeometry(curve, TS, 0.11, RS, false);
    var p = g.attributes.position;
    var col = new Float32Array(p.count * 3);
    var c = new THREE.Vector3(), v = new THREE.Vector3();
    var base = new THREE.Color(0x5b4a33), tip = new THREE.Color(0x56672f), tmp = new THREE.Color();
    for (var i = 0; i < p.count; i++) {
      var ring = Math.floor(i / (RS + 1)), t = ring / TS;
      curve.getPointAt(t, c);
      v.fromBufferAttribute(p, i).sub(c);
      var r = 1.25 - 0.62 * t;
      NODES.forEach(function (nd) { r += 0.35 * Math.exp(-Math.pow((t - nd.t) / 0.012, 2)); });
      v.multiplyScalar(r).add(c);
      p.setXYZ(i, v.x, v.y, v.z);
      tmp.copy(base).lerp(tip, smooth(0.25, 0.95, t));
      var b = 0.82 + n3(t * 60, (i % (RS + 1)) * 0.7, 1) * 0.36;
      col[i * 3] = tmp.r * b; col[i * 3 + 1] = tmp.g * b; col[i * 3 + 2] = tmp.b * b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }

  /* Pack a cluster round the stem at one node, the way they grow: each
     fruit on its own short stalk, stalk end toward the twig, crowded
     shoulder to shoulder. A few rounds of relaxation keep them from
     passing through one another. */
  function packCluster(R, P, T, node) {
    var n1 = new THREE.Vector3(0, 0, 1).cross(T).normalize();
    var n2 = new THREE.Vector3().crossVectors(T, n1).normalize();
    var list = [];
    for (var k = 0; k < node.n; k++) {
      var s = 0.86 + R() * 0.2;
      list.push({
        ang: k * 2.39996 + R() * 0.6,
        along: (R() - 0.5) * 0.95,
        s: s,
        ripe: node.ripe[k % node.ripe.length],
        seed: R(),
        spin: R() * TAU,
        tilt: (R() - 0.5) * 0.7
      });
    }
    var pos = list.map(function (c) {
      var rdir = n1.clone().multiplyScalar(Math.cos(c.ang)).addScaledVector(n2, Math.sin(c.ang));
      return P.clone().addScaledVector(T, c.along).addScaledVector(rdir, 0.13 + SY * c.s + 0.1);
    });
    var tmp = new THREE.Vector3();
    for (var it = 0; it < 18; it++) {
      for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
          var need = (SX * list[i].s + SX * list[j].s) * 0.98;
          tmp.subVectors(pos[j], pos[i]);
          var d = tmp.length();
          if (d < need && d > 1e-5) {
            tmp.multiplyScalar((need - d) / d * 0.5);
            pos[i].sub(tmp); pos[j].add(tmp);
          }
        }
      }
      // keep each one hanging off the stem at stalk's length
      for (i = 0; i < list.length; i++) {
        tmp.subVectors(pos[i], P);
        var ax = tmp.dot(T);
        ax = clamp(ax, -0.8, 0.8);
        var radial = tmp.addScaledVector(T, -tmp.dot(T));
        var rl = radial.length() || 1;
        var want = 0.13 + SY * list[i].s + 0.1;
        pos[i].copy(P).addScaledVector(T, ax).addScaledVector(radial, Math.max(rl, want) / rl);
      }
    }
    return list.map(function (c, i) {
      var out = pos[i].clone().sub(P);
      out.addScaledVector(T, -out.dot(T)).normalize();
      var up = out.clone().negate().addScaledVector(T, c.tilt).normalize();
      var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.spin));
      return { pos: pos[i], q: q, s: c.s, ripe: c.ripe, seed: c.seed,
               phase: c.seed * TAU, wob: 0, wobT: 0 };
    });
  }

  /* ------------------------------------------------------------------ */
  /* The studio the gloss reflects: two softboxes in front, a warm strip */
  /* behind for the rim, a dark green room around them.                 */
  /* ------------------------------------------------------------------ */
  function studio(renderer) {
    var W = 512, H = 256;
    var c = canvas(W, H), g = c.getContext('2d');
    var sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#2f4f40'); sky.addColorStop(0.5, '#173327'); sky.addColorStop(1, '#0a1712');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    function box(x, y, w, h, colr, blur) {
      g.save();
      g.shadowColor = colr; g.shadowBlur = blur;
      g.fillStyle = colr;
      g.fillRect(x - w / 2, y - h / 2, w, h);
      g.restore();
    }
    box(436, 78, 74, 50, '#fff5e6', 18);   // key softbox, front left and high
    box(338, 112, 22, 84, '#f4e2c0', 12);  // a strip in front, to the right
    box(118, 70, 60, 26, '#e6bd70', 16);   // the gold rim light, behind
    var floor = g.createLinearGradient(0, 200, 0, H);
    floor.addColorStop(0, 'rgba(70,58,34,0)'); floor.addColorStop(1, 'rgba(70,58,34,.8)');
    g.fillStyle = floor; g.fillRect(0, 200, W, 56);
    var tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    var pm = new THREE.PMREMGenerator(renderer);
    var rt = pm.fromEquirectangular(tex);
    pm.dispose(); tex.dispose();
    return rt.texture;
  }

  /* ------------------------------------------------------------------ */
  /* The scene                                                           */
  /* ------------------------------------------------------------------ */
  function create(canvasEl) {
    if (!canvasEl) return null;

    var renderer = new THREE.WebGLRenderer({
      canvas: canvasEl, antialias: true, alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 1.75));
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    var scene = new THREE.Scene();
    scene.environment = studio(renderer);

    var FOV = 28;
    var camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 200);

    /* --- light ------------------------------------------------------- */
    scene.add(new THREE.HemisphereLight(0xdbe8dc, 0x14251c, 0.55));
    var key = new THREE.DirectionalLight(0xfff0dc, 2.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.025;
    key.shadow.radius = 4;
    scene.add(key); scene.add(key.target);
    var rim = new THREE.DirectionalLight(0xe8bd70, 2.3);     // the palette gold, from behind
    scene.add(rim); scene.add(rim.target);
    var fill = new THREE.DirectionalLight(0x8fbaa3, 0.55);   // the forest, from the left
    scene.add(fill); scene.add(fill.target);

    /* --- materials and shared geometry ------------------------------- */
    var skin = skinMaps();
    var cMat = cherryMaterial(skin);
    var sMat = new THREE.MeshStandardMaterial({ color: 0x5f6a2a, roughness: 0.62 });
    var cGeo = cherryGeometry();
    var stGeo = stalkGeometry();

    /* --- the branch ---------------------------------------------------- */
    var R = rng(20261001);
    var branch = new THREE.Group();
    scene.add(branch);
    var curve = new THREE.CatmullRomCurve3(BRANCH_PTS.map(function (p) {
      return new THREE.Vector3(p[0], p[1], p[2]);
    }));
    var twig = new THREE.Mesh(branchGeometry(curve),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 }));
    twig.castShadow = true; twig.receiveShadow = true;
    branch.add(twig);

    var leafMat = leafMaterial(false), youngMat = leafMaterial(true);
    var leaves = [];
    var clusterList = [];
    NODES.forEach(function (node, ni) {
      var P = curve.getPointAt(node.t), T = curve.getTangentAt(node.t).normalize();
      if (node.n) clusterList = clusterList.concat(packCluster(R, P, T, node));
      node.leaves.forEach(function (lf, li) {
        var B = new THREE.Vector3(-T.y, T.x, 0).normalize();
        var dir = B.clone().multiplyScalar(lf.side).addScaledVector(T, 0.5)
          .add(new THREE.Vector3(0, -0.18, lf.out || 0)).normalize();
        var nrm = new THREE.Vector3(0, 0, 1);
        nrm.addScaledVector(dir, -nrm.dot(dir)).normalize();
        nrm.applyAxisAngle(dir, lf.tilt);
        var side = new THREE.Vector3().crossVectors(nrm, dir);
        var m = new THREE.Matrix4().makeBasis(dir, side, nrm);
        var pivot = new THREE.Group();
        pivot.position.copy(P).addScaledVector(dir, 0.05);
        pivot.position.z += lf.z;
        pivot.quaternion.setFromRotationMatrix(m);
        var mesh = new THREE.Mesh(leafGeometry(ni * 7 + li + 3), lf.young ? youngMat : leafMat);
        mesh.scale.setScalar(lf.len);
        mesh.castShadow = true; mesh.receiveShadow = true;
        pivot.add(mesh);
        branch.add(pivot);
        leaves.push({ mesh: mesh, phase: R() * TAU, amp: 0.05 + R() * 0.04, rate: 0.9 + R() * 0.6 });
      });
    });

    var cluster = cherrySet(cGeo, stGeo, cMat, sMat, clusterList);
    branch.add(cluster.fruit); branch.add(cluster.stalk);

    /* --- the picked ones, loose in the air ---------------------------- */
    var LOOSE_RIPE = [0.8, 0.86, 0.72, 0.9, 0.78, 0.68, 0.84, 0.58, 0.94, 0.76, 0.82];
    var looseCount = 10;
    var looseList = [];
    for (var i = 0; i < looseCount; i++) {
      var q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * TAU, R() * TAU, R() * TAU));
      var ax = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
      looseList.push({
        ripe: LOOSE_RIPE[i], seed: R(),
        home: new THREE.Vector3(), pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        q: q0, spinAxis: ax, spinRate: 0.16 + R() * 0.22,
        w: new THREE.Vector3(),
        s: 0.9 + R() * 0.28, z: 0,
        ph: [R() * TAU, R() * TAU, R() * TAU],
        fr: [0.21 + R() * 0.12, 0.17 + R() * 0.12, 0.13 + R() * 0.1],
        delay: 0, wob: 0, wobT: 0, hoverCool: 0, active: true, bare: i % 2 === 1
      });
    }
    var loose = cherrySet(cGeo, stGeo, cMat, sMat, looseList);
    scene.add(loose.fruit); scene.add(loose.stalk);

    /* --- state ---------------------------------------------------------- */
    var state = {
      running: false, visible: false, ready: false,
      w: 1, h: 1, U: 60, dist: 30,
      pointer: { on: false, x: 0, y: 0, nx: 0, ny: 0 },
      cam: { x: 0, y: 0 },
      gust: 0, gustV: 0,
      introAt: -1, swing: 0, swingV: 0,
      t: 0, layout: null
    };

    var m4 = new THREE.Matrix4(), j4 = new THREE.Matrix4(), p4 = new THREE.Matrix4();
    var vA = new THREE.Vector3(), vB = new THREE.Vector3(), vS = new THREE.Vector3();
    var qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), eA = new THREE.Euler();
    var X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
    var PIV = SY * 0.9;
    var ndc = new THREE.Vector2(), ray = new THREE.Raycaster();

    /* Where a canvas pixel lands at a given depth. */
    function pxToWorld(px, py, z, out) {
      ndc.set(px / state.w * 2 - 1, -(py / state.h * 2 - 1));
      ray.setFromCamera(ndc, camera);
      var o = ray.ray.origin, d = ray.ray.direction;
      var k = (z - o.z) / d.z;
      return out.set(o.x + d.x * k, o.y + d.y * k, z);
    }
    function worldToPx(v) {
      vS.copy(v).project(camera);
      return { x: (vS.x + 1) / 2 * state.w, y: (1 - vS.y) / 2 * state.h };
    }

    /* --- layout: everything is placed in the page's own pixels -------- */
    function place() {
      var L = state.layout;
      if (!L) return;
      var W = state.w, H = state.h;
      var phone = W < 760;
      state.U = phone ? clamp(W / 9.5, 36, 46) : clamp(W / 24, 46, 62);
      state.dist = (H / state.U) / (2 * Math.tan(FOV / 2 * Math.PI / 180));
      camera.position.set(0, 0, state.dist);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      var st = L.stage;
      // the branch reaches in from the top-right corner of the stage
      var bs = phone ? clamp((W * 0.95 / state.U) / 10.6, 0.55, 0.9) : 1;
      branch.scale.setScalar(bs);
      pxToWorld(st.x + st.w + state.U * (phone ? 0.2 : 0.6),
                st.y + state.U * (phone ? 2.6 : 2.0), 0, branch.position);
      branch.userData.rz = phone ? 0.10 : 0.02;

      // the loose ones: free space in the stage, clear of the copy
      var avoid = (L.avoid || []).map(function (r) {
        var m = state.U * 0.75;
        return { x: r.x - m, y: r.y - m, w: r.w + m * 2, h: r.h + m * 2 };
      });
      branch.updateMatrixWorld(true);
      var taken = clusterList.map(function (c) {
        vA.copy(c.pos).applyMatrix4(branch.matrixWorld);
        return worldToPx(vA);
      });
      var R2 = rng(77), homes = [];
      var want = phone ? 6 : looseCount;
      var gap = state.U * (phone ? 1.5 : 1.9);
      for (var tries = 0; tries < 900 && homes.length < want; tries++) {
        var hx = st.x + state.U * 0.8 + R2() * (st.w - state.U * 1.6);
        // below the fade at the top edge, and above the foot of the stage
        var top = st.y + Math.max(state.U * 0.9, 140);
        var hy = top + R2() * (st.y + st.h - state.U * 0.9 - top);
        var bad = avoid.some(function (r) {
          return hx > r.x && hx < r.x + r.w && hy > r.y && hy < r.y + r.h;
        });
        if (bad) continue;
        var near = taken.concat(homes).some(function (p) {
          var dx = p.x - hx, dy = p.y - hy;
          return dx * dx + dy * dy < gap * gap;
        });
        if (near) continue;
        homes.push({ x: hx, y: hy });
      }
      looseList.forEach(function (c, i) {
        c.active = i < homes.length;
        if (!c.active) return;
        c.z = -3.5 + R2() * 4.5;
        pxToWorld(homes[i].x, homes[i].y, c.z, c.home);
        if (state.introAt < 0) c.pos.copy(c.home);
        c.delay = 0.12 + i * 0.085;
      });

      // the key light follows the branch, so its shadows stay inside it
      vA.set(-5, -1.3, 0).applyMatrix4(branch.matrixWorld);
      key.target.position.copy(vA);
      key.position.copy(vA).add(vB.set(-6, 8, 10));
      var sc = key.shadow.camera, ext = 8.5 * bs;
      sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
      sc.near = 1; sc.far = 40;
      sc.updateProjectionMatrix();
      rim.target.position.copy(vA); rim.position.copy(vA).add(vB.set(6, 7, -9));
      fill.target.position.copy(vA); fill.position.copy(vA).add(vB.set(-10, -2, 6));
      state.ready = true;
    }

    function resize() {
      var w = canvasEl.clientWidth || canvasEl.offsetWidth;
      var h = canvasEl.clientHeight || canvasEl.offsetHeight;
      if (!w || !h) return;
      state.w = w; state.h = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      place();
      if (reduced) draw(0);
    }

    /* --- one frame ------------------------------------------------------ */
    function update(dt) {
      var t = state.t;
      var intro = state.introAt < 0 ? 0 : t - state.introAt;

      // the breeze, plus whatever the reader stirred up
      state.gustV += (-state.gust * 9 - state.gustV * 2.4) * dt;
      state.gust += state.gustV * dt;
      // the branch swings in on arrival, overshoots, and settles
      state.swingV += (-state.swing * 7.5 - state.swingV * 1.6) * dt;
      state.swing += state.swingV * dt;

      var sway = Math.sin(t * 0.52) * 0.018 + Math.sin(t * 1.27 + 1.2) * 0.007;
      branch.rotation.z = branch.userData.rz + sway + state.gust * 0.05 + state.swing;
      branch.rotation.x = Math.sin(t * 0.41 + 0.5) * 0.035 + state.gust * 0.04;
      branch.rotation.y = Math.sin(t * 0.33) * 0.04;

      leaves.forEach(function (lf) {
        lf.mesh.rotation.x = Math.sin(t * lf.rate + lf.phase) * lf.amp +
                             state.gust * 0.25 * Math.sin(t * 7 + lf.phase);
        lf.mesh.rotation.y = Math.sin(t * lf.rate * 0.7 + lf.phase * 2) * lf.amp * 0.4;
      });

      // the cluster fruit hang a little loose on their stalks
      clusterList.forEach(function (c, i) {
        c.wobT += dt;
        var jig = Math.sin(t * 1.7 + c.phase) * 0.035 + state.gust * 0.12 * Math.sin(t * 6.3 + c.phase);
        var jog = Math.cos(t * 1.3 + c.phase * 1.7) * 0.03;
        qA.setFromEuler(eA.set(jig, 0, jog));
        j4.makeTranslation(0, PIV, 0).multiply(p4.makeRotationFromQuaternion(qA))
          .multiply(m4.makeTranslation(0, -PIV, 0));
        var sq = c.wob * Math.exp(-c.wobT * 3.2) * Math.sin(c.wobT * 17);
        vS.set(c.s * (1 + sq * 0.10), c.s * (1 - sq * 0.12), c.s * (1 + sq * 0.10));
        m4.compose(c.pos, c.q, vS).multiply(j4);
        cluster.fruit.setMatrixAt(i, m4);
        cluster.stalk.setMatrixAt(i, m4);
      });
      cluster.fruit.instanceMatrix.needsUpdate = true;
      cluster.stalk.instanceMatrix.needsUpdate = true;

      // the loose ones: a slow float on a soft spring, and a nudge from the pointer
      var P = state.pointer;
      looseList.forEach(function (c, i) {
        if (!c.active) {
          m4.makeScale(0, 0, 0);
          loose.fruit.setMatrixAt(i, m4); loose.stalk.setMatrixAt(i, m4);
          return;
        }
        var target = vA.set(
          c.home.x + Math.sin(t * c.fr[0] + c.ph[0]) * 0.32,
          c.home.y + Math.sin(t * c.fr[1] + c.ph[1]) * 0.42,
          c.home.z + Math.sin(t * c.fr[2] + c.ph[2]) * 0.3);
        var f = vB.subVectors(target, c.pos).multiplyScalar(5.2);
        if (P.on) {
          var at = pxToWorld(P.x, P.y, c.pos.z, vS);
          var dx = c.pos.x - at.x, dy = c.pos.y - at.y;
          var d = Math.sqrt(dx * dx + dy * dy), RAD = 1.7;
          if (d < RAD && d > 1e-4) {
            var push = Math.pow(1 - d / RAD, 2) * 26;
            f.x += dx / d * push; f.y += dy / d * push;
            c.w.x -= dy / d * push * 0.02; c.w.y += dx / d * push * 0.02;
          }
          if (d < 0.62 && c.hoverCool <= 0) { c.wob = 1; c.wobT = 0; c.hoverCool = 1.4; }
        }
        c.hoverCool -= dt;
        // and they give one another room
        for (var j = 0; j < looseList.length; j++) {
          if (j === i || !looseList[j].active) continue;
          var o = looseList[j].pos;
          var ex = c.pos.x - o.x, ey = c.pos.y - o.y, ez = c.pos.z - o.z;
          var dd = Math.sqrt(ex * ex + ey * ey + ez * ez);
          if (dd < 1.05 && dd > 1e-4) {
            var k = (1.05 - dd) * 14 / dd;
            f.x += ex * k; f.y += ey * k; f.z += ez * k;
          }
        }
        c.vel.addScaledVector(f, dt).multiplyScalar(Math.exp(-dt * 2.3));
        c.pos.addScaledVector(c.vel, dt);

        // a lazy tumble, which a nudge spins up and the air slows down again
        c.w.multiplyScalar(Math.exp(-dt * 1.1));
        vS.copy(c.spinAxis).multiplyScalar(c.spinRate).add(c.w);
        var wl = vS.length();
        if (wl > 1e-5) {
          qB.setFromAxisAngle(vS.multiplyScalar(1 / wl), wl * dt);
          c.q.premultiply(qB);
        }

        // arrival: each one pops in on its own beat, rising into place
        var k2 = state.introAt < 0 ? 1 : elasticOut(clamp((intro - c.delay) / 1.1, 0, 1));
        c.wobT += dt;
        var sq = c.wob * Math.exp(-c.wobT * 3.4) * Math.sin(c.wobT * 18);
        var s = c.s * k2;
        vS.set(s * (1 + sq * 0.12), s * (1 - sq * 0.14), s * (1 + sq * 0.12));
        m4.compose(c.pos, c.q, vS);
        loose.fruit.setMatrixAt(i, m4);
        if (c.bare) m4.scale(vS.set(0, 0, 0));
        loose.stalk.setMatrixAt(i, m4);
      });
      loose.fruit.instanceMatrix.needsUpdate = true;
      loose.stalk.instanceMatrix.needsUpdate = true;

      // the eye drifts a little with the pointer, so the depths separate
      var tx = P.on ? P.nx * 0.45 : 0, ty = P.on ? -P.ny * 0.25 : 0;
      state.cam.x += (tx - state.cam.x) * damp(0.04, dt);
      state.cam.y += (ty - state.cam.y) * damp(0.04, dt);
      camera.position.set(state.cam.x, state.cam.y, state.dist);
      camera.lookAt(state.cam.x * 0.3, state.cam.y * 0.3, 0);

      // a pointer near the twig rustles it
      if (P.on) {
        var bw = pxToWorld(P.x, P.y, 0, vS);
        var near = clusterList.some(function (c) {
          vA.copy(c.pos).applyMatrix4(branch.matrixWorld);
          return vA.distanceTo(bw) < 1.2;
        });
        if (near) state.gustV += 3.2 * dt;
      }
    }

    function draw(dt) {
      if (!state.ready) return;
      if (!reduced) update(dt);
      else { state.t = 0; update(0); }
      renderer.render(scene, camera);
    }

    var clock = new THREE.Clock();
    function frame() {
      if (!state.running) return;
      global.requestAnimationFrame(frame);
      if (!state.visible || !state.ready) return;
      var dt = Math.min(clock.getDelta(), 1 / 20);
      state.t += dt;
      draw(dt);
    }

    resize();
    if (!reduced) {
      state.running = true;
      clock.start();
      global.requestAnimationFrame(frame);
    }

    /* A tap scatters whatever is close — off they bob, spinning, and the
       springs bring them home again. */
    function poke(px, py) {
      if (reduced || !state.ready) return;
      looseList.forEach(function (c) {
        if (!c.active) return;
        var at = pxToWorld(px, py, c.pos.z, vS);
        var dx = c.pos.x - at.x, dy = c.pos.y - at.y;
        var d = Math.sqrt(dx * dx + dy * dy), RAD = 3.2;
        if (d > RAD) return;
        var k = (1 - d / RAD);
        if (d < 1e-3) { dx = 0; dy = 1; d = 1; }
        c.vel.x += dx / d * k * 7; c.vel.y += dy / d * k * 7 + k * 2.5;
        c.vel.z += (Math.random() - 0.4) * k * 3;
        c.w.x += (Math.random() - 0.5) * 8 * k; c.w.y += (Math.random() - 0.5) * 8 * k;
        c.w.z += (Math.random() - 0.5) * 8 * k;
        c.wob = 0.6 + k; c.wobT = 0;
      });
      var bw = pxToWorld(px, py, 0, vB);
      var hit = false;
      clusterList.forEach(function (c) {
        vA.copy(c.pos).applyMatrix4(branch.matrixWorld);
        if (vA.distanceTo(bw) < 2.2) { c.wob = 0.7; c.wobT = 0; hit = true; }
      });
      state.gustV += hit ? 2.6 : 0.8;
    }

    var api = {
      resize: resize,
      setLayout: function (layout) {
        state.layout = layout;
        resize();
      },
      setVisible: function (v) {
        v = !!v;
        if (v && !state.visible) {
          clock.getDelta();
          if (state.introAt < 0 && !reduced) {
            state.introAt = state.t;
            state.swing = 0.16; state.swingV = 0;
            looseList.forEach(function (c) {
              c.pos.copy(c.home); c.pos.y -= 1.2;
              c.vel.set(0, 1.6, 0);
            });
          }
          if (reduced) draw(0);
        }
        state.visible = v;
      },
      setPointer: function (px, py, on) {
        var P = state.pointer;
        P.on = on !== false;
        P.x = px; P.y = py;
        P.nx = px / state.w * 2 - 1; P.ny = py / state.h * 2 - 1;
      },
      poke: poke,
      // advance the simulation by hand (tests on slow software GL)
      step: function (sec) {
        var n = Math.round(sec * 30);
        for (var i = 0; i < n; i++) { state.t += 1 / 30; update(1 / 30); }
        renderer.render(scene, camera);
      },
      debug: function () {
        return {
          ready: state.ready, visible: state.visible, U: state.U, t: +state.t.toFixed(2),
          loose: looseList.filter(function (c) { return c.active; }).map(function (c) {
            var p = worldToPx(c.pos); return [Math.round(p.x), Math.round(p.y)];
          }),
          cluster: clusterList.length,
          scales: looseList.map(function (c, i) {
            loose.fruit.getMatrixAt(i, m4);
            return +vS.setFromMatrixScale(m4).x.toFixed(2);
          }),
          zs: looseList.map(function (c) { return +c.pos.z.toFixed(2); })
        };
      }
    };
    return api;
  }

  global.LattecanoFooter = { supported: true, create: create };
})(window);
