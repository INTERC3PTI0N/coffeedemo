/* =====================================================================
   LATTECANO — interaction layer
   Lenis for the scroll feel, GSAP/ScrollTrigger for everything timed
   to it, plus the two genuinely useful tools (Roast Lab, Brew Guide).
   ===================================================================== */
(function () {
  'use strict';

  var GS = window.gsap;
  var ST = window.ScrollTrigger;
  var hasGSAP = !!(GS && ST);
  var reduced = window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp  = function (a, b, t) { return a + (b - a) * t; };

  /* ================================================================= */
  /* 0 · Smooth scroll                                                 */
  /* ================================================================= */
  var lenis = null;

  function initScroll() {
    if (!hasGSAP) return;
    GS.registerPlugin(ST);

    if (window.Lenis && !reduced) {
      lenis = new window.Lenis({
        duration: 1.15,
        easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
        smoothWheel: true,
        wheelMultiplier: 1,
        touchMultiplier: 1.6
      });
      lenis.on('scroll', ST.update);
      GS.ticker.add(function (time) { lenis.raf(time * 1000); });
    }

    // Off in every mode. Left on, GSAP clamps its delta on a slow frame and
    // its clock falls behind wall time, which stretches every duration and
    // delays every onComplete.
    GS.ticker.lagSmoothing(0);

    // anchors go through Lenis so the easing matches the rest of the page
    $$('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href');
        if (!id || id === '#') return;
        var t = document.querySelector(id);
        if (!t) return;
        e.preventDefault();
        if (lenis) lenis.scrollTo(t, { offset: 0, duration: 1.4 });
        else t.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
      });
    });
  }

  /* ================================================================= */
  /* 1 · Text splitting                                                */
  /* ================================================================= */
  function splitWords(el) {
    var text = el.textContent.trim().replace(/\s+/g, ' ');
    el.textContent = '';
    var frag = document.createDocumentFragment();
    text.split(' ').forEach(function (w, i) {
      var clip = document.createElement('span');
      clip.className = 'clip';
      var word = document.createElement('span');
      word.className = 'word';
      word.textContent = w;
      clip.appendChild(word);
      frag.appendChild(clip);
      if (i < text.split(' ').length - 1) frag.appendChild(document.createTextNode(' '));
    });
    el.appendChild(frag);
    return $$('.word', el);
  }

  function splitLines(el) {
    // keep any decorative first child (the quote mark) out of the split
    var keep = $$(':scope > *', el).filter(function (n) {
      return n.classList.contains('quote__mark');
    });
    keep.forEach(function (n) { n.remove(); });

    var words = splitWords(el);
    // group the clips into visual lines by their offsetTop
    var lines = [], last = null, current = null;
    words.forEach(function (w) {
      var top = w.parentNode.offsetTop;
      if (last === null || Math.abs(top - last) > 4) {
        current = []; lines.push(current); last = top;
      }
      current.push(w.parentNode);
    });

    el.innerHTML = '';
    keep.forEach(function (n) { el.appendChild(n); });
    lines.forEach(function (group) {
      var clip = document.createElement('span');
      clip.className = 'clip clip--line';
      var line = document.createElement('span');
      line.className = 'line';
      group.forEach(function (g, i) {
        line.appendChild(document.createTextNode((i ? ' ' : '') + g.textContent));
      });
      clip.appendChild(line);
      el.appendChild(clip);
    });
    return $$('.line', el);
  }

  /* ================================================================= */
  /* 2 · Preloader                                                     */
  /* ================================================================= */
  function initLoader(done) {
    var loader = $('#loader');
    var bar = $('#loaderBar');
    var pct = $('#loaderPct');
    var letters = $$('.loader__word b');

    // Nobody who asked for less motion wants to sit through a loader.
    if (!hasGSAP || !loader || reduced) {
      document.body.classList.remove('is-loading');
      if (loader) loader.remove();
      if (hasGSAP) ST.refresh();
      done();
      return;
    }

    var counter = { v: 0 };
    var tl = GS.timeline({
      onComplete: function () {
        document.body.classList.remove('is-loading');
        loader.remove();
        ST.refresh();
        done();
      }
    });

    tl.to(letters, {
      y: '0%', opacity: 1, duration: 0.85,
      stagger: 0.045, ease: 'power3.out'
    })
      .to(bar, { scaleX: 1, duration: 1.25, ease: 'power2.inOut' }, 0.15)
      .to(counter, {
        v: 100, duration: 1.25, ease: 'power2.inOut',
        onUpdate: function () {
          pct.textContent = String(Math.round(counter.v)).padStart(2, '0');
        }
      }, 0.15)
      .to(letters, {
        y: '-115%', opacity: 0, duration: 0.6,
        stagger: 0.028, ease: 'power3.in'
      }, '+=0.15')
      .to(loader, { yPercent: -100, duration: 1, ease: 'expo.inOut' }, '-=0.25');
  }

  /* ================================================================= */
  /* 3 · Cursor                                                        */
  /* ================================================================= */
  function initCursor() {
    var cur = $('#cursor');
    if (!cur || !hasGSAP) return;
    if (window.matchMedia('(pointer: coarse)').matches) { cur.remove(); return; }

    var dot = $('.cursor__dot', cur);
    var ring = $('.cursor__ring', cur);
    var label = $('.cursor__label', cur);
    var LABELS = { link: '', play: 'PLAY', open: 'OPEN', view: 'VIEW',
                   drag: 'DIAL', roast: 'ROAST', close: 'CLOSE' };

    var pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    var dotPos = { x: pos.x, y: pos.y };
    var ringPos = { x: pos.x, y: pos.y };

    window.addEventListener('pointermove', function (e) {
      pos.x = e.clientX; pos.y = e.clientY;
      GS.to(cur, { opacity: 1, duration: 0.3, overwrite: true });
    }, { passive: true });

    GS.ticker.add(function () {
      dotPos.x = lerp(dotPos.x, pos.x, 0.42);
      dotPos.y = lerp(dotPos.y, pos.y, 0.42);
      ringPos.x = lerp(ringPos.x, pos.x, 0.16);
      ringPos.y = lerp(ringPos.y, pos.y, 0.16);
      GS.set(dot, { x: dotPos.x, y: dotPos.y });
      GS.set(ring, { x: ringPos.x, y: ringPos.y });
    });

    document.addEventListener('pointerover', function (e) {
      var t = e.target.closest ? e.target.closest('[data-cursor]') : null;
      if (t) {
        var kind = t.getAttribute('data-cursor');
        label.textContent = LABELS[kind] || '';
        cur.classList.add('is-active');
        GS.to(ring, { scale: label.textContent ? 1.75 : 1.4, duration: 0.4, ease: 'power3.out' });
      }
    });
    document.addEventListener('pointerout', function (e) {
      var t = e.target.closest ? e.target.closest('[data-cursor]') : null;
      if (t) {
        cur.classList.remove('is-active');
        GS.to(ring, { scale: 1, duration: 0.4, ease: 'power3.out' });
      }
    });
  }

  /* ================================================================= */
  /* 4 · Nav + progress                                                */
  /* ================================================================= */
  function initChrome() {
    if (!hasGSAP) return;
    var nav = $('#nav');
    var bar = $('#progressBar');

    // light/dark inversion per section
    $$('[data-theme]').forEach(function (sec) {
      ST.create({
        trigger: sec,
        start: 'top 40px',
        end: 'bottom 40px',
        onToggle: function (self) {
          if (self.isActive) nav.classList.toggle('is-light', sec.dataset.theme === 'light');
        }
      });
    });

    // hide going down, show coming back up
    var lastY = 0;
    ST.create({
      start: 0, end: 'max',
      onUpdate: function (self) {
        var y = self.scroll();
        if (bar) GS.set(bar, { scaleX: self.progress });
        if (y > 220 && y > lastY) nav.classList.add('is-hidden');
        else nav.classList.remove('is-hidden');
        lastY = y;
      }
    });

    var rail = $('#railtab');
    if (rail) {
      rail.addEventListener('click', function () {
        var lab = $('#lab');
        if (lenis) lenis.scrollTo(lab, { duration: 1.5 });
        else lab.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }

  /* ================================================================= */
  /* 5 · Hero                                                          */
  /* ================================================================= */
  var beans = null;

  /* The wordmark should span the viewport whatever font actually loads,
     so measure the letters and solve for the size rather than guessing. */
  function fitHeroTitle() {
    var t = $('#heroTitle');
    if (!t) return;
    var clips = $$('.clip', t);
    if (!clips.length) return;

    var probe = 120;
    t.style.fontSize = probe + 'px';
    var w = 0;
    clips.forEach(function (c) { w += c.getBoundingClientRect().width; });
    if (!w) return;

    var size = probe * (window.innerWidth * 0.96) / w;
    size = Math.min(size, window.innerHeight * 0.30);
    t.style.fontSize = size + 'px';

    var cue = $('.hero__cue');
    if (cue) cue.style.bottom = Math.round(size * 0.82 + 26) + 'px';
  }

  function initHero() {
    var frame = $('#hero');   // carries the --cx/--cy window vars
    var title = $('#heroTitle');
    var chars = $$('.hero__title .ch');

    fitHeroTitle();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fitHeroTitle);
    }

    if (!hasGSAP) {
      GSfallback();
      return;
    }

    // intro
    var intro = GS.timeline({ paused: true });
    if (reduced) {
      GS.set(chars, { y: '0%' });
      window.__heroIntro = intro;
    } else {
    intro
      .to(chars, { y: '0%', duration: 1.15, stagger: 0.055, ease: 'expo.out' })
      .from('.hero__tag span', { y: 22, opacity: 0, duration: 0.9, stagger: 0.1, ease: 'power3.out' }, 0.35)
      .from('.filmbtn', { y: 22, opacity: 0, duration: 0.9, ease: 'power3.out' }, 0.45)
      .from('.hero__cue', { opacity: 0, duration: 0.8, ease: 'power2.out' }, 0.8)
      .from('.hero__stage', { scale: 1.12, opacity: 0, duration: 1.8, ease: 'expo.out' }, 0);

    window.__heroIntro = intro;
    }

    // scroll: the window opens to full bleed, the wordmark scales past you
    GS.timeline({
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: 0.6,
        onUpdate: function (self) { if (beans) beans.setHeroDolly(self.progress); }
      }
    })
      .to(frame, { '--cy': '0%', '--cx': '0%', '--cr': '0px', ease: 'none' }, 0)
      .to(title, { scale: 1.7, yPercent: 34, opacity: 0, ease: 'power1.in' }, 0)
      .to('.hero__ui', { opacity: 0, y: -40, ease: 'none' }, 0)
      .to('.hero__cue', { opacity: 0, ease: 'none' }, 0);

    function GSfallback() {
      chars.forEach(function (c) { c.style.transform = 'translateY(0)'; });
      var mask = $('#heroMask');
      if (mask) mask.style.display = 'none';
    }
  }

  /* ================================================================= */
  /* 5b · The bean field — one pool, re-choreographed per section       */
  /* ================================================================= */
  var FORMATION_BY_SECTION = [
    ['#hero',       'swarm'],
    ['#manifesto',  'margin'],
    ['#altitude',   'fall'],
    ['#roasts',     'sparse'],
    ['#quote',      'margin'],
    ['#lab',        'orbit'],
    ['#collection', 'stream'],
    ['#journey',    'arc'],
    ['#brew',       'sparse'],
    ['#cta',        'swirl']
  ];

  function initBeans() {
    var canvas = $('#beanField');
    if (!canvas || !window.LattecanoBeans || !window.LattecanoBeans.supported) {
      if (canvas) canvas.remove();
      return;
    }

    beans = window.LattecanoBeans.create(canvas);
    if (!beans) return;
    window.__beans = beans;

    window.addEventListener('pointermove', function (e) {
      beans.setPointer(
        (e.clientX / window.innerWidth - 0.5) * 2,
        (e.clientY / window.innerHeight - 0.5) * 2
      );
    }, { passive: true });

    if (!hasGSAP) return;

    /* Which formation is showing has to be derived from the scroll position,
       not from whichever section's onToggle happened to fire last. During a
       fast scroll or a jump, several sections toggle in one tick and the
       last callback wins even when it is nowhere near the viewport. */
    var zones = [];
    FORMATION_BY_SECTION.forEach(function (pair) {
      var sec = $(pair[0]);
      if (!sec) return;
      zones.push({
        name: pair[1],
        el: sec,
        // a measuring trigger: it reports start/end in scroll pixels and
        // accounts for pinning, but drives nothing itself
        st: ST.create({ trigger: sec, start: 'top center', end: 'bottom center' })
      });
    });

    if (!zones.length) return;

    ST.create({
      start: 0,
      end: 'max',
      onUpdate: function (self) {
        var y = self.scroll();

        // zones are in document order, so the last one already entered wins
        var zone = zones[0];
        for (var i = 0; i < zones.length; i++) {
          if (y >= zones[i].st.start) zone = zones[i];
        }

        var st = zone.st;
        var p = clamp((y - st.start) / Math.max(1, st.end - st.start), 0, 1);
        beans.setFormation(zone.name, p);
        beans.setLocal(p);
        beans.setLight(zone.el.dataset.theme === 'light' ? 1 : 0);
      }
    });

    // spin the cup by hand in the hero
    var cupGrab = $('#heroGrab');
    if (cupGrab && beans.nudgeCup) {
      var cupDragging = false, cupLastX = 0;
      cupGrab.addEventListener('pointerdown', function (e) {
        cupDragging = true; cupLastX = e.clientX;
        if (cupGrab.setPointerCapture) cupGrab.setPointerCapture(e.pointerId);
      });
      cupGrab.addEventListener('pointermove', function (e) {
        if (!cupDragging) return;
        beans.nudgeCup((e.clientX - cupLastX) * 0.010);
        cupLastX = e.clientX;
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
        cupGrab.addEventListener(ev, function () { cupDragging = false; });
      });
    }

    // spin the feature bean by hand in the Roast Lab
    var grab = $('#labGrab');
    if (grab) {
      var dragging = false, lastX = 0;
      grab.addEventListener('pointerdown', function (e) {
        dragging = true; lastX = e.clientX;
        if (grab.setPointerCapture) grab.setPointerCapture(e.pointerId);
      });
      grab.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        beans.nudgeFeature((e.clientX - lastX) * 0.012);
        lastX = e.clientX;
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
        grab.addEventListener(ev, function () { dragging = false; });
      });
    }
  }

  /* ================================================================= */
  /* 6 · Manifesto + quote                                             */
  /* ================================================================= */
  function initStatements() {
    if (!hasGSAP) return;

    var m = $('.manifesto__text');
    if (m) {
      var words = splitWords(m);
      GS.set(words, { yPercent: 118, rotateX: -62, opacity: 0, transformOrigin: '50% 100%' });
      GS.to(words, {
        yPercent: 0, rotateX: 0, opacity: 1,
        duration: 1.05, stagger: 0.026, ease: 'expo.out',
        scrollTrigger: { trigger: m, start: 'top 78%' }
      });
    }

    // the drawn "sip" flourish
    drawStroke('#sipPath', '.manifesto__mark', 'top 84%');
    $$('.roasts__flourish path').forEach(function (p, i) {
      dashIn(p, '.roasts__head', 'top 80%', i * 0.18);
    });
    $$('.sig path').forEach(function (p) { dashIn(p, '.quote figure', 'top 74%', 0.5); });
    $$('.manifesto__mark path').forEach(function (p, i) {
      dashIn(p, '.manifesto__mark', 'top 88%', i * 0.2);
    });

    var q = $('.quote blockquote');
    if (q) {
      // wait for fonts so the line breaks are measured correctly
      var run = function () {
        var lines = splitLines(q);
        GS.set(lines, { yPercent: 115 });
        GS.to(lines, {
          yPercent: 0, duration: 1.1, stagger: 0.075, ease: 'expo.out',
          scrollTrigger: { trigger: q, start: 'top 80%' }
        });
        GS.from('.quote figcaption', {
          y: 24, opacity: 0, duration: 0.9, ease: 'power3.out',
          scrollTrigger: { trigger: q, start: 'top 60%' }
        });
        ST.refresh();
      };
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
      else setTimeout(run, 300);
    }

    function drawStroke(sel) { /* handled by dashIn */ }

    function dashIn(path, trigger, start, delay) {
      if (!path) return;
      var len = 0;
      try { len = path.getTotalLength(); } catch (e) { return; }
      GS.set(path, { strokeDasharray: len, strokeDashoffset: len });
      GS.to(path, {
        strokeDashoffset: 0, duration: 1.6, delay: delay || 0, ease: 'power2.inOut',
        scrollTrigger: { trigger: trigger, start: start }
      });
    }
  }

  /* ================================================================= */
  /* 7 · Altitude parallax + counters                                  */
  /* ================================================================= */
  function initAltitude() {
    if (!hasGSAP) return;

    var sec = $('#altitude');
    if (!sec) return;

    var layers = [
      ['.hl--r4', 120, 1.02],
      ['.hl--r3', 200, 1.05],
      ['.hl--r2', 300, 1.09],
      ['.foreground .hl--r1', 420, 1.14],
      ['.foreground .hl--rows', 470, 1.16]
    ];

    // each ridge rises at its own rate — that difference is the depth
    layers.forEach(function (l) {
      var el = $(l[0]);
      if (!el) return;
      GS.fromTo(el,
        { yPercent: 46, scale: 1 },
        {
          yPercent: -l[1] / 22, scale: l[2], ease: 'none',
          scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom bottom', scrub: 0.7 }
        });
    });

    GS.fromTo('.hl--haze', { opacity: 0.2 }, {
      opacity: 0.9, ease: 'none',
      scrollTrigger: { trigger: sec, start: 'top center', end: 'bottom bottom', scrub: true }
    });

    GS.from('.altitude__copy > *', {
      y: 34, opacity: 0, duration: 0.95, stagger: 0.1, ease: 'power3.out',
      scrollTrigger: { trigger: '.altitude__copy', start: 'top 76%' }
    });

    initCounters();
  }

  function initCounters() {
    if (!hasGSAP) return;
    $$('.count').forEach(function (el) {
      var to = parseFloat(el.dataset.to || '0');
      var suffix = el.dataset.suffix || '';
      var obj = { v: 0 };
      GS.to(obj, {
        v: to, duration: 1.9, ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 88%' },
        onUpdate: function () {
          el.textContent = Math.round(obj.v).toLocaleString('en-IN') + suffix;
        }
      });
    });
  }

  /* ================================================================= */
  /* 8 · Roast panels                                                  */
  /* ================================================================= */
  function initPanels() {
    var panels = $$('.panel');
    if (!panels.length) return;

    function open(p) {
      panels.forEach(function (x) { x.classList.toggle('is-open', x === p); });
    }

    panels.forEach(function (p, i) {
      p.addEventListener('mouseenter', function () { open(p); });
      p.addEventListener('focusin', function () { open(p); });

      /* Clicking a closed panel expands it; clicking the one already open
         takes you into it. The cursor has been promising OPEN on these all
         along without anything behind it. */
      p.addEventListener('click', function (e) {
        if (e.target.closest('a') || e.target.closest('button')) return;
        if (!p.classList.contains('is-open')) { open(p); return; }
        if (window.__openSpecimen) window.__openSpecimen(i, p);
      });

      p.setAttribute('tabindex', '0');
      p.setAttribute('role', 'button');
      p.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.target !== p) return;
        e.preventDefault();
        if (!p.classList.contains('is-open')) { open(p); return; }
        if (window.__openSpecimen) window.__openSpecimen(i, p);
      });
    });

    if (!hasGSAP) return;
    GS.from(panels, {
      yPercent: 16, opacity: 0, duration: 1, stagger: 0.08, ease: 'power3.out',
      scrollTrigger: { trigger: '.panels', start: 'top 82%' }
    });
    GS.from('.roasts__head .display', {
      y: 40, opacity: 0, duration: 1, ease: 'power3.out',
      scrollTrigger: { trigger: '.roasts__head', start: 'top 84%' }
    });
  }

  /* ================================================================= */
  /* 8b · The Chamber — roast a lot, or open a bag                     */
  /* ================================================================= */

  // Each roast: where it sits on the scale, how hot and how long it runs,
  // and the colour it lands on.
  var LOTS = [
    { name: 'Cascara Morning', hex: 0xC9A06A, bag: 0xE8CFA6, temp: 196, secs: 550,
      note: 'Dropped early, while the acidity is still in front.' },
    { name: 'Terrace No. 7',   hex: 0xA9773C, temp: 205, secs: 630,
      note: 'A slow ramp through drying to keep the honey sweetness.' },
    { name: 'Canopy Blend',    hex: 0x6E3E1D, temp: 214, secs: 710,
      note: 'Held to the edge of first crack, then developed for cocoa.' },
    { name: 'Night Terminal',  hex: 0x3F1E0D, temp: 228, secs: 820,
      note: 'Taken well past first crack until the oils come up.' },
    { name: 'Cold Cellar',     hex: 0x33180B, temp: 232, secs: 860,
      note: 'The longest development we run — built to be brewed cold.' }
  ];

  // Flavour axes for the wheel, 0–100
  var PRODUCTS = [
    { name: 'Cascara Morning', hex: 0xC9A06A, bag: 0xE8CFA6,
      desc: 'Jasmine, white peach and a lime-leaf finish that stays bright as it cools.',
      axes: { Floral: 92, Fruit: 84, Sweet: 62, Nutty: 22, Cocoa: 14, Body: 34 },
      facts: [['Process','Washed'],['Altitude','2,150 m'],['Varietal','Heirloom'],['Roast','Light']],
      glow: 'rgba(232,207,166,0.55)', roastLine: 'LIGHT \u00B7 WASHED',
      coord: '[ 06\u00B0 09\u2032 N, 38\u00B0 12\u2032 E ]',
      notes: ['Jasmine', 'White peach', 'Lime leaf'] },
    { name: 'Terrace No. 7', hex: 0xA9773C, bag: 0xD8B27C,
      desc: 'Apricot and brown sugar over a soft, tea-like body. Sixteen days of rest.',
      axes: { Floral: 58, Fruit: 88, Sweet: 82, Nutty: 40, Cocoa: 28, Body: 52 },
      facts: [['Process','Honey'],['Altitude','2,080 m'],['Varietal','Kurume'],['Roast','Med-light']],
      glow: 'rgba(216,178,124,0.50)', roastLine: 'MED-LIGHT \u00B7 HONEY',
      coord: '[ 06\u00B0 11\u2032 N, 38\u00B0 15\u2032 E ]',
      notes: ['Apricot', 'Brown sugar', 'Black tea'] },
    { name: 'Canopy Blend', hex: 0x6E3E1D, bag: 0xC08F52,
      desc: 'Cocoa, hazelnut and dried fig. Two farms, one drum, roasted every Tuesday.',
      axes: { Floral: 24, Fruit: 46, Sweet: 74, Nutty: 86, Cocoa: 90, Body: 78 },
      facts: [['Process','Mixed'],['Altitude','1,900 m'],['Varietal','Blend'],['Roast','Medium']],
      glow: 'rgba(192,143,82,0.45)', roastLine: 'MEDIUM \u00B7 BLEND',
      coord: '[ 06\u00B0 04\u2032 N, 38\u00B0 02\u2032 E ]',
      notes: ['Cocoa', 'Hazelnut', 'Dried fig'] },
    { name: 'Night Terminal', hex: 0x3F1E0D, bag: 0x8E6236,
      desc: 'Dark chocolate, molasses and walnut. Built to hold its own under milk.',
      axes: { Floral: 10, Fruit: 22, Sweet: 60, Nutty: 72, Cocoa: 96, Body: 94 },
      facts: [['Process','Natural'],['Altitude','1,840 m'],['Varietal','Bourbon'],['Roast','Dark']],
      glow: 'rgba(196,72,52,0.42)', roastLine: 'DARK \u00B7 NATURAL',
      coord: '[ 05\u00B0 58\u2032 N, 37\u00B0 54\u2032 E ]',
      notes: ['Dark chocolate', 'Molasses', 'Walnut'] }
  ];

  var chamber = null;
  var cardLayer = null;

  function initChamber() {
    var root = $('#chamber');
    var canvas = $('#chamberCanvas');
    if (!root || !canvas) return;

    var hasStage = window.LattecanoChamber && window.LattecanoChamber.supported;
    var stage = null;

    var hud = $('#chamberHud');
    var sheet = $('#chamberSheet');
    var spec = $('#chamberSpec');
    var veil = $('.chamber__veil', root);
    var phases = $$('#chPhases li');
    var curve = $('#chCurve');
    var curveDot = $('#chCurveDot');
    var lastFocus = null;
    var tl = null;

    function stopTimeline() {
      if (tl) { tl.kill(); tl = null; }
    }

    function close() {
      if (!root.classList.contains('is-open')) return;
      stopTimeline();
      stopNotes();

      /* Release everything that traps the user up front. If this waited on a
         tween's onComplete and the ticker stalled — a heavy frame, a
         backgrounded tab — the overlay would stay up with the page locked
         behind it and no way out. The fade is cosmetic; the release is not. */
      root.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('no-scroll');
      if (lenis) lenis.start();
      if (stage) stage.setOpen(false);
      if (cardLayer) cardLayer.unmuteAll();
      if (lastFocus && lastFocus.focus) lastFocus.focus();

      var hidden = false;
      function hide() {
        if (hidden) return;
        hidden = true;
        root.classList.remove('is-open');
        flier.style.display = 'none';
        flier.innerHTML = '';
      }

      if (hasGSAP && !reduced) {
        GS.to([hud, sheet], { opacity: 0, y: 18, duration: 0.3, ease: 'power2.in' });
        GS.to(veil, {
          opacity: 0, duration: 0.45, ease: 'power2.inOut', delay: 0.12,
          onComplete: hide
        });
        setTimeout(hide, 900);          // backstop, whatever the ticker does
      } else {
        hide();
      }
    }

    function open(mode) {
      lastFocus = document.activeElement;
      root.classList.add('is-open');
      root.setAttribute('aria-hidden', 'false');
      document.body.classList.add('no-scroll');
      if (lenis) lenis.stop();

      hud.style.display   = mode === 'drum' ? '' : 'none';
      sheet.style.display = mode === 'bloom' ? '' : 'none';
      spec.style.display  = mode === 'specimen' ? '' : 'none';

      if (hasStage) {
        stage = window.LattecanoChamber.getStage(canvas);
        stage.resize();
        stage.setMode(mode);
        stage.setOpen(true);
      }

      if (hasGSAP && !reduced) {
        GS.fromTo(veil, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out' });
      } else {
        GS && GS.set ? GS.set(veil, { opacity: 1 }) : (veil.style.opacity = 1);
      }
      $('#chamberClose').focus();
    }

    /* ---------------- drum: roast a lot ---------------------------- */
    function roast(index) {
      var lot = LOTS[index] || LOTS[2];
      open('drum');

      $('#chTitle').textContent = lot.name;
      $('#chKicker').textContent = 'IN THE DRUM';
      phases.forEach(function (li) { li.classList.remove('is-on'); });

      if (hasStage) {
        stage.seedDrum();
        stage.setTarget(lot.hex);
        stage.state.roastT = 0;
        stage.state.drumSpin = 0;
      }

      if (!hasGSAP) {
        if (hasStage) stage.state.roastT = 1;
        $('#chNote').textContent = lot.note;
        return;
      }

      var len = curve ? curve.getTotalLength() : 0;
      if (curve) GS.set(curve, { strokeDasharray: len, strokeDashoffset: len });

      var prog = { t: 0 };
      stopTimeline();
      tl = GS.timeline();

      tl.fromTo([hud.querySelector('.ch-head'), $('.ch-gauges'), $('.ch-phases'), $('.ch-curve')],
                { opacity: 0, y: 22 },
                { opacity: 1, y: 0, duration: 0.7, stagger: 0.07, ease: 'power3.out' }, 0.1)
        .to(prog, {
          t: 1, duration: 7.2, ease: 'power1.inOut',
          onUpdate: function () {
            var t = prog.t;
            if (hasStage) {
              stage.state.roastT = t;
              // the drum speeds up as the charge dries and loosens
              stage.state.drumSpin = 0.85 + t * 1.15;
            }
            $('#chTemp').textContent = Math.round(lerp(20, lot.temp, Math.pow(t, 0.62)));
            var secs = Math.round(lot.secs * t);
            $('#chTime').textContent =
              String(Math.floor(secs / 60)).padStart(2, '0') + ':' +
              String(secs % 60).padStart(2, '0');
            $('#chMass').textContent = (10 - t * 1.55).toFixed(1);   // moisture loss

            phases.forEach(function (li) {
              li.classList.toggle('is-on', t >= parseFloat(li.dataset.at));
            });

            if (curve) {
              GS.set(curve, { strokeDashoffset: len * (1 - t) });
              var pt = curve.getPointAtLength(len * t);
              curveDot.setAttribute('cx', pt.x);
              curveDot.setAttribute('cy', pt.y);
            }

            $('#chNote').textContent =
              t < 0.30 ? 'Driving off the moisture…' :
              t < 0.58 ? 'Sugars browning — the drum is loosening up.' :
              t < 0.82 ? 'First crack. You would hear it from the door.' :
              t < 0.98 ? 'Development: this is where the cup is decided.' :
                         lot.note;
          }
        }, 0.35);
    }

    /* ---------------- bloom: open a bag ---------------------------- */
    var flier = $('#chamberFlier');
    var notesLayer = $('#chamberNotes');
    var noteEls = [];
    var noteRaf = 0;

    function stopNotes() {
      if (noteRaf) { cancelAnimationFrame(noteRaf); noteRaf = 0; }
    }

    /* The labels are DOM, pinned every frame to where their cluster actually
       is in the scene. Cheaper than text in WebGL, and it stays crisp. */
    function trackNotes() {
      stopNotes();
      (function loop() {
        noteRaf = requestAnimationFrame(loop);
        if (!stage || !stage.clusterScreen) return;
        // Label tracking is cosmetic. It runs on the same tick that opens the
        // panel, so anything thrown here must not take the opening with it.
        var pts;
        try { pts = stage.clusterScreen(); } catch (e) { return; }
        if (!pts) return;
        for (var i = 0; i < noteEls.length && i < pts.length; i++) {
          var el = noteEls[i], pt = pts[i];
          el.style.left = pt.x + 'px';
          el.style.top = pt.y + 'px';
          // behind the bag reads as further away
          el.style.zIndex = String(1000 - Math.round(pt.depth * 1000));
          el.style.filter = pt.depth > 0.62 ? 'opacity(.45)' : '';
        }
      })();
    }

    function openBag(index, cardEl) {
      var prod = PRODUCTS[index] || PRODUCTS[0];

      /* 1 · take a still of the card and pin it exactly where it sits */
      var inner = cardEl && cardEl.querySelector('.card__inner');
      var from = inner ? inner.getBoundingClientRect() : null;
      flier.innerHTML = '';
      if (inner && hasGSAP) {
        var clone = inner.cloneNode(true);
        flier.appendChild(clone);

        /* What the reader is looking at is the WebGL card, so the still
           that flies to the chamber has to carry its painted face — and
           the card itself drops out of the scene for the trip, or the two
           would be on screen at the same time. */
        if (cardLayer) {
          var faceURL = cardLayer.faceURL(index);
          var bagEl = clone.querySelector('.card__bag');
          if (faceURL && bagEl) {
            bagEl.innerHTML = '';
            bagEl.style.background = 'url(' + faceURL + ') center/cover no-repeat';
            bagEl.style.transform = 'none';
          }
          cardLayer.mute(index, true);
        }

        GS.set(flier, {
          left: from.left, top: from.top, width: from.width, height: from.height,
          opacity: 1, rotateY: 0, scale: 1
        });
        flier.style.display = 'block';
      } else {
        flier.style.display = 'none';
      }

      open('bloom');

      $('#poTitle').textContent = prod.name;
      $('#poDesc').textContent = prod.desc;

      if (hasStage) {
        stage.setTarget(prod.hex);
        stage.setBagColour(prod.bag);
        stage.state.roastT = 1;             // already roasted; this is the bag
        stage.prepareBloom(prod.axes);
        stage.setBloomPhase(0);
      }

      // facts
      var dl = $('#poFacts');
      dl.innerHTML = '';
      prod.facts.forEach(function (f) {
        var d = document.createElement('div');
        var dt = document.createElement('dt'); dt.textContent = f[0];
        var dd = document.createElement('dd'); dd.textContent = f[1];
        d.appendChild(dt); d.appendChild(dd); dl.appendChild(d);
      });

      // the cluster labels
      notesLayer.innerHTML = '';
      noteEls = Object.keys(prod.axes).map(function (k) {
        var el = document.createElement('div');
        el.className = 'note';
        el.innerHTML = '<span class="note__dot"></span>' +
                       '<span class="note__name"></span>' +
                       '<span class="note__val"></span>';
        el.querySelector('.note__name').textContent = k;
        el.querySelector('.note__val').textContent = prod.axes[k];
        notesLayer.appendChild(el);
        return el;
      });
      trackNotes();

      if (!hasGSAP) {
        if (hasStage) stage.setBloomPhase(1);
        noteEls.forEach(function (el) { el.style.opacity = 1; });
        return;
      }

      /* 2 · fly it to the middle, turn it edge-on, and hand over to WebGL */
      var vw = window.innerWidth, vh = window.innerHeight;
      var tw = Math.min(330, vw * 0.62);
      var th = tw * (from ? from.height / from.width : 1.5);

      // land on the bag, not on the middle of the window
      var subject = (hasStage && stage.subjectScreen)
        ? stage.subjectScreen() : { x: vw / 2, y: vh / 2 };

      var phase = { b: 0 };
      stopTimeline();
      tl = GS.timeline();

      if (from) {
        tl.to(flier, {
          left: subject.x - tw / 2, top: subject.y - th / 2,
          width: tw, height: th,
          duration: 0.78, ease: 'expo.inOut'
        }, 0)
          .to(flier, { rotateY: -92, duration: 0.6, ease: 'power3.inOut' }, 0.42)
          .to(flier, { opacity: 0, duration: 0.25, ease: 'power2.in' }, 0.78)
          .set(flier, { display: 'none' }, 1.05);
      }

      tl.to(phase, {
        b: 1, duration: 3.4, ease: 'power2.inOut',
        onUpdate: function () { if (hasStage) stage.setBloomPhase(phase.b); }
      }, from ? 0.86 : 0.1);

      // the labels arrive as their clusters form
      tl.to(noteEls, {
        opacity: 1, duration: 0.5, stagger: 0.07, ease: 'power2.out'
      }, from ? 3.0 : 2.2);

      tl.fromTo(sheet, { opacity: 0, x: 40 },
                       { opacity: 1, x: 0, duration: 0.8, ease: 'expo.out' }, 1.0)
        .fromTo('.po-facts div', { opacity: 0, y: 14 },
                { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, ease: 'power3.out' }, 1.3)
        .fromTo('#poCta', { opacity: 0, y: 14 },
                { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }, 1.55);
    }

    /* ---------------- specimen: look at one bean -------------------- */

    // what each lot's bean actually is, for the line of numbers under it
    var SPECS = [
      ['Washed',  '2,150 m', 'Heirloom', 'Screen 16'],
      ['Honey',   '2,080 m', 'Kurume',   'Screen 17'],
      ['Mixed',   '1,900 m', 'Blend',    'Screen 16'],
      ['Natural', '1,840 m', 'Bourbon',  'Screen 18'],
      ['Natural', '1,780 m', 'Bourbon',  'Screen 15']
    ];
    var SPEC_KEYS = ['Process', 'Altitude', 'Varietal', 'Grade'];

    function openSpecimen(index, panelEl) {
      var lot = LOTS[index] || LOTS[2];
      var roast = roastAt([8, 34, 60, 88, 96][index] || 50);

      // the panel's own art carries you into the view
      var art = panelEl && panelEl.querySelector('.panel__art');
      var from = art ? art.getBoundingClientRect() : null;
      flier.innerHTML = '';
      if (art && hasGSAP) {
        var ghost = document.createElement('div');
        ghost.style.cssText = 'width:100%;height:100%;background-size:cover;' +
          'background-position:center;background-image:' + art.style.backgroundImage;
        flier.appendChild(ghost);
        GS.set(flier, {
          left: from.left, top: from.top, width: from.width, height: from.height,
          opacity: 1, scale: 1, rotateY: 0
        });
        flier.style.display = 'block';
      } else {
        flier.style.display = 'none';
      }

      open('specimen');

      $('#specTitle').textContent = lot.name;
      $('#specKicker').textContent = 'LOT 0' + (index + 1) + ' · YIRGA HIGHLANDS';

      var dl = $('#specFacts');
      dl.innerHTML = '';
      (SPECS[index] || SPECS[2]).forEach(function (val, i) {
        var d = document.createElement('div');
        var dt = document.createElement('dt'); dt.textContent = SPEC_KEYS[i];
        var dd = document.createElement('dd'); dd.textContent = val;
        d.appendChild(dt); d.appendChild(dd); dl.appendChild(d);
      });

      if (hasStage) {
        stage.setSpecimen(lot.hex, roast.rough, roast.oil);
        stage.setSpecReveal(hasGSAP ? 0 : 1);
      }

      if (!hasGSAP) return;

      stopTimeline();
      tl = GS.timeline();

      if (from) {
        // the art opens out to full bleed, then dissolves off the bean
        tl.to(flier, {
          left: 0, top: 0, width: window.innerWidth, height: window.innerHeight,
          duration: 0.9, ease: 'expo.inOut'
        }, 0)
          .to(flier, { opacity: 0, duration: 0.55, ease: 'power2.inOut' }, 0.55)
          .set(flier, { display: 'none' }, 1.15);
      }

      if (hasStage) {
        tl.to({ v: 0 }, {
          v: 1, duration: 1.0, ease: 'back.out(1.5)',
          onUpdate: function () { stage.setSpecReveal(this.targets()[0].v); }
        }, 0.5);
      }

      tl.fromTo('.spec__head > *', { y: 22, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.7, stagger: 0.08, ease: 'power3.out' }, 0.75)
        .fromTo('.spec__facts div', { y: 16, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.55, stagger: 0.07, ease: 'power3.out' }, 0.95)
        .fromTo('.spec__hint', { opacity: 0 }, { opacity: 1, duration: 0.6 }, 1.3);
    }

    // turn the specimen by hand
    var specGrab = $('#specGrab');
    if (specGrab) {
      var sDragging = false, sLastX = 0;
      specGrab.addEventListener('pointerdown', function (e) {
        sDragging = true; sLastX = e.clientX;
        if (specGrab.setPointerCapture) specGrab.setPointerCapture(e.pointerId);
      });
      specGrab.addEventListener('pointermove', function (e) {
        if (!sDragging || !hasStage) return;
        stage.nudgeSpecimen((e.clientX - sLastX) * 0.011);
        sLastX = e.clientX;
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
        specGrab.addEventListener(ev, function () { sDragging = false; });
      });
    }

    window.__openSpecimen = openSpecimen;

    /* ---------------- wiring --------------------------------------- */
    $$('[data-roast-open]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        roast(+btn.dataset.roastOpen);
      });
    });

    $$('[data-pour]').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        openBag(+card.dataset.pour, card);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openBag(+card.dataset.pour, card);
        }
      });
    });

    $('#chamberClose').addEventListener('click', close);
    root.addEventListener('click', function (e) {
      if (e.target === root || e.target.classList.contains('chamber__veil')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });

    window.addEventListener('resize', function () { if (stage) stage.resize(); });
  }

  /* ================================================================= */
  /* 8c · Still renders: the section art is a picture of real beans     */
  /* ================================================================= */
  function initBeanArt() {
    if (!window.LattecanoChamber || !window.LattecanoChamber.supported) return;
    var render = window.LattecanoChamber.renderBeanBed;

    // done off the critical path — these are decoration, not content
    var jobs = [];
    $$('.panel').forEach(function (panel, i) {
      jobs.push(function () {
        var art = $('.panel__art', panel);
        if (!art) return;
        var url = render(LOTS[i] ? LOTS[i].hex : 0x6e3e1d, 560, 820, i);
        art.style.backgroundImage = 'url(' + url + ')';
        art.classList.add('is-bed');
      });
    });
    /* The cards want the same bean bed the CSS bag uses, so it is rendered
       once here and handed to the 3D layer rather than drawn twice. */
    $$('.card__bed').forEach(function (bed, i) {
      jobs.push(function () {
        var url = render(PRODUCTS[i] ? PRODUCTS[i].hex : 0x6e3e1d, 420, 520, i + 9);
        bed.style.backgroundImage = 'url(' + url + ')';
        if (cardLayer) cardLayer.setBed(i, url);
      });
    });

    (function next() {
      var job = jobs.shift();
      if (!job) return;
      try { job(); } catch (e) { /* decoration only */ }
      if (jobs.length) setTimeout(next, 16);
    })();
  }

  /* ================================================================= */
  /* 8d · The collection's cards, drawn in 3D                          */
  /* ================================================================= */
  function initCards() {
    if (cardLayer) return;
    if (!window.LattecanoCards || !window.LattecanoCards.supported) return;

    var sec = $('.collection');
    var canvas = $('#cardCanvas');
    if (!sec || !canvas) return;

    try {
      cardLayer = window.LattecanoCards.create(canvas, PRODUCTS, []);
    } catch (e) {
      cardLayer = null;
    }
    if (!cardLayer) return;

    /* Each 3D card rides on the box the CSS bag still occupies. The DOM
       keeps the layout and the hit target; the layer only draws. */
    var hosts = [];
    $$('[data-pour]').forEach(function (card) {
      var i = +card.dataset.pour;
      var bag = $('.card__bag', card);
      if (!bag) return;
      hosts[i] = bag;
      cardLayer.bind(i, bag);

      card.addEventListener('pointerenter', function () { cardLayer.setHover(i, true); });
      card.addEventListener('pointerleave', function () { cardLayer.setHover(i, false); });
      card.addEventListener('focus', function () { cardLayer.setHover(i, true); });
      card.addEventListener('blur', function () { cardLayer.setHover(i, false); });
    });
    if (!hosts.length) return;

    sec.classList.add('is-3d');

    sec.addEventListener('pointermove', function (e) {
      var r = sec.getBoundingClientRect();
      cardLayer.setPointer(
        (e.clientX - r.left) / r.width * 2 - 1,
        (e.clientY - r.top) / r.height * 2 - 1
      );
    });

    /* Only draw while the section is actually on screen — this canvas is
       full-bleed and the page has a second one running all the time. */
    function watch() {
      var r = sec.getBoundingClientRect();
      cardLayer.setVisible(r.bottom > -200 && r.top < window.innerHeight + 200);
    }
    watch();
    if (hasGSAP && ST) {
      ST.create({
        trigger: sec, start: 'top bottom', end: 'bottom top',
        onToggle: function (self) { cardLayer.setVisible(self.isActive); }
      });
    } else {
      window.addEventListener('scroll', watch, { passive: true });
    }

    window.addEventListener('resize', function () { cardLayer.resize(); });
    if (hasGSAP && ST) ST.addEventListener('refresh', function () { cardLayer.resize(); });
  }

  /* ================================================================= */
  /* 9 · Roast Lab                                                     */
  /* ================================================================= */
  // Roast stops. `oil` is the clearcoat: light roasts are dry and matte, dark
  // roasts push oil to the surface and start to shine.
  var ROAST_STOPS = [
    { at: 0,   hex: 0xC9A06A, rough: 0.86, oil: 0.08, name: 'LIGHT',        temp: 196, time: '09:10' },
    { at: 30,  hex: 0xA56C33, rough: 0.78, oil: 0.18, name: 'MEDIUM-LIGHT', temp: 205, time: '10:30' },
    { at: 60,  hex: 0x6E3E1D, rough: 0.64, oil: 0.40, name: 'MEDIUM',       temp: 214, time: '11:50' },
    { at: 100, hex: 0x33180B, rough: 0.52, oil: 0.55, name: 'DARK',         temp: 228, time: '13:40' }
  ];

  function roastAt(t) {
    var a = ROAST_STOPS[0], b = ROAST_STOPS[ROAST_STOPS.length - 1];
    for (var i = 0; i < ROAST_STOPS.length - 1; i++) {
      if (t >= ROAST_STOPS[i].at && t <= ROAST_STOPS[i + 1].at) {
        a = ROAST_STOPS[i]; b = ROAST_STOPS[i + 1]; break;
      }
    }
    var k = (t - a.at) / Math.max(1, b.at - a.at);
    var mix = function (ca, cb) {
      var r = Math.round(lerp((ca >> 16) & 255, (cb >> 16) & 255, k));
      var g = Math.round(lerp((ca >> 8) & 255, (cb >> 8) & 255, k));
      var bl = Math.round(lerp(ca & 255, cb & 255, k));
      return (r << 16) | (g << 8) | bl;
    };
    return {
      hex: mix(a.hex, b.hex),
      oil: lerp(a.oil, b.oil, k),
      rough: lerp(a.rough, b.rough, k),
      name: k < 0.5 ? a.name : b.name,
      temp: Math.round(lerp(a.temp, b.temp, k)),
      time: k < 0.5 ? a.time : b.time
    };
  }

  function profileAt(t) {
    var n = t / 100;
    return {
      acidity: Math.round(clamp(96 - n * 82, 8, 100)),
      body:    Math.round(clamp(32 + n * 62, 8, 100)),
      sweet:   Math.round(clamp(100 - Math.pow((n - 0.52) * 2.1, 2) * 100, 20, 96)),
      bitter:  Math.round(clamp(10 + Math.pow(n, 1.7) * 86, 6, 100))
    };
  }

  function initLab() {
    var range = $('#roastRange');
    if (!range) return;

    var nameEl = $('#roastName');
    var tempEl = $('#roastTemp');
    var noteEl = $('#roastNote');
    var bars = {};
    $$('.bar').forEach(function (b) {
      bars[b.dataset.key] = { fill: $('b', b), num: $('em', b) };
    });

    function apply(t) {
      var r = roastAt(t);
      var p = profileAt(t);

      // the whole field takes the roast, not just one bean
      if (beans) beans.setRoast(r.hex, r.oil, r.rough);

      nameEl.textContent = r.name;
      tempEl.textContent = r.temp + '°C · ' + r.time;

      Object.keys(bars).forEach(function (k) {
        bars[k].fill.style.width = p[k] + '%';
        bars[k].num.textContent = p[k];
      });

      noteEl.textContent = t < 45
        ? 'BEST AS FILTER · 1:16 · 94°C'
        : (t < 78 ? 'FILTER OR ESPRESSO · 1:15 · 93°C'
                  : 'BEST AS ESPRESSO · 1:2 · 92°C');

      // tie the swatch on the slider thumb to the roast
      range.style.setProperty('--thumb', '#' + r.hex.toString(16).padStart(6, '0'));
    }

    range.addEventListener('input', function () { apply(+range.value); });
    apply(+range.value);

    // clicking a roast panel jumps the lab to that roast
    $$('.panel').forEach(function (p) {
      var idx = +p.dataset.roast;
      p.addEventListener('click', function (e) {
        if (!e.target.closest('a')) return;
        var target = [8, 34, 60, 88, 96][idx] || 50;
        if (hasGSAP) {
          GS.to(range, {
            value: target, duration: 0.9, ease: 'power2.inOut',
            onUpdate: function () { apply(+range.value); }
          });
        } else { range.value = target; apply(target); }
      });
    });

    if (!hasGSAP) return;

    GS.from('.lab__panel', {
      x: 70, opacity: 0, duration: 1.15, ease: 'expo.out',
      scrollTrigger: { trigger: '#lab', start: 'top 62%' }
    });
    GS.fromTo('.lab__title',
      { scale: 1.22, opacity: 0 },
      {
        scale: 1, opacity: 0.9, duration: 1.4, ease: 'expo.out',
        scrollTrigger: { trigger: '#lab', start: 'top 70%' }
      });
  }

  /* ================================================================= */
  /* 10 · Collection — pinned horizontal                               */
  /* ================================================================= */
  function initCollection() {
    if (!hasGSAP) return;
    var sec = $('.collection');
    var track = $('#collectionTrack');
    var barEl = $('#collectionBar');
    if (!sec || !track) return;

    var distance = function () {
      return Math.max(0, track.scrollWidth - window.innerWidth + 40);
    };

    GS.to(track, {
      x: function () { return -distance(); },
      ease: 'none',
      scrollTrigger: {
        trigger: sec,
        start: 'top top',
        end: function () { return '+=' + (distance() + window.innerHeight * 0.4); },
        pin: true,
        scrub: 0.8,
        invalidateOnRefresh: true,
        anticipatePin: 1,
        onUpdate: function (self) {
          if (barEl) GS.set(barEl, { scaleX: 0.14 + self.progress * 0.86, transformOrigin: 'left' });
        }
      }
    });

    // background drifts the other way — cheap, convincing parallax
    GS.to('.collection__bgart', {
      xPercent: -9, scale: 1.16, ease: 'none',
      scrollTrigger: {
        trigger: sec, start: 'top bottom', end: 'bottom top', scrub: 1
      }
    });

    GS.from('.collection__intro > *', {
      y: 40, opacity: 0, duration: 1, stagger: 0.09, ease: 'power3.out',
      scrollTrigger: { trigger: sec, start: 'top 70%' }
    });

    initTilt();
  }

  /* real 3D tilt on the product cards */
  function initTilt() {
    if (reduced) return;
    $$('[data-tilt]').forEach(function (card) {
      var inner = $('.card__inner', card);
      if (!inner) return;
      /* A card the 3D layer draws tilts in WebGL instead; tilting the DOM
         box as well would resize the very rect the layer measures. The
         layer comes up later than this wiring, so the check is made on
         the event, not on the binding. */
      var owned = function () {
        return !!cardLayer && card.hasAttribute('data-pour');
      };

      card.addEventListener('pointermove', function (e) {
        if (owned()) return;
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        if (hasGSAP) {
          GS.to(inner, {
            rotateY: px * 17, rotateX: -py * 15,
            transformPerspective: 1100, duration: 0.5, ease: 'power2.out'
          });
        }
      });
      card.addEventListener('pointerleave', function () {
        if (owned()) return;
        if (hasGSAP) GS.to(inner, { rotateY: 0, rotateX: 0, duration: 0.8, ease: 'elastic.out(1,0.6)' });
      });
    });
  }

  /* ================================================================= */
  /* 11 · Journey                                                      */
  /* ================================================================= */
  function initJourney() {
    if (!hasGSAP) return;
    var sec = $('#journey');
    if (!sec) return;

    GS.to('.journey__heroart', {
      yPercent: 16, scale: 1.14, ease: 'none',
      scrollTrigger: { trigger: '.journey__hero', start: 'top bottom', end: 'bottom top', scrub: true }
    });

    GS.from('.journey__codes span', {
      yPercent: 108, duration: 1.3, stagger: 0.12, ease: 'expo.out',
      scrollTrigger: { trigger: '.journey__hero', start: 'top 58%' }
    });
    GS.from('.journey__codes i', {
      scaleX: 0, opacity: 0, duration: 1, ease: 'expo.out',
      scrollTrigger: { trigger: '.journey__hero', start: 'top 58%' }
    });
    GS.to('.journey__codes', {
      letterSpacing: '0.08em', ease: 'none',
      scrollTrigger: { trigger: '.journey__hero', start: 'top top', end: 'bottom top', scrub: true }
    });

    GS.from('.journey__caption > *', {
      y: 34, opacity: 0, duration: 0.95, stagger: 0.1, ease: 'power3.out',
      scrollTrigger: { trigger: '.journey__caption', start: 'top 80%' }
    });

    // globe tips and turns as you move past it
    GS.fromTo('.globe',
      { rotateX: 26, rotateZ: -18, scale: 0.9 },
      {
        rotateX: 6, rotateZ: 6, scale: 1.03, ease: 'none',
        scrollTrigger: { trigger: '.journey__map', start: 'top bottom', end: 'bottom top', scrub: 0.8 }
      });

    GS.from('.fact', {
      y: 36, opacity: 0, duration: 0.9, stagger: 0.09, ease: 'power3.out',
      scrollTrigger: { trigger: '.journey__facts', start: 'top 82%' }
    });

    // draw the shipping route, then run a marker along it
    var path = $('#routePath');
    var pod = $('.route__pod');
    if (path && pod) {
      var len = path.getTotalLength();
      GS.set(path, { strokeDasharray: len, strokeDashoffset: len });
      GS.set(['.route__a', '.route__b'], { scale: 0, transformOrigin: 'center' });

      var tl = GS.timeline({
        scrollTrigger: { trigger: '.journey__map', start: 'top 62%' }
      });
      tl.to('.route__a', { scale: 1, duration: 0.5, ease: 'back.out(2)' })
        .to(path, { strokeDashoffset: 0, duration: 2, ease: 'power2.inOut' }, 0.1)
        .to('.route__b', { scale: 1, duration: 0.5, ease: 'back.out(2)' }, 1.7);

      var pos = { t: 0 };
      GS.to(pos, {
        t: 1, duration: 4.5, repeat: -1, ease: 'power1.inOut', repeatDelay: 0.4,
        onUpdate: function () {
          var pt = path.getPointAtLength(len * pos.t);
          pod.setAttribute('cx', pt.x);
          pod.setAttribute('cy', pt.y);
        }
      });
    }
  }

  /* ================================================================= */
  /* 12 · Brew Guide (the genuinely useful bit)                        */
  /* ================================================================= */
  var METHODS = {
    v60: {
      label: 'V60', water: 250, ratio: 16.7, grind: 'Medium-fine',
      temp: '94 °C', time: '3:00',
      steps: [
        'Rinse the paper, warm the carafe, and throw the rinse water away.',
        'Bloom with twice the coffee weight in water. Wait 40 seconds.',
        'Pour in slow spirals, keeping the bed level, until you hit the total.',
        'Aim to finish the drawdown at three minutes. Swirl, then serve.'
      ]
    },
    aero: {
      label: 'AeroPress', water: 220, ratio: 14, grind: 'Fine-medium',
      temp: '88 °C', time: '2:00',
      steps: [
        'Invert the AeroPress and add the grounds.',
        'Fill to the top, stir ten times, and cap with a rinsed filter.',
        'Steep for 90 seconds, then flip onto your cup.',
        'Press slowly — thirty seconds from top to bottom. Stop at the hiss.'
      ]
    },
    press: {
      label: 'French Press', water: 240, ratio: 15, grind: 'Coarse',
      temp: '93 °C', time: '4:00',
      steps: [
        'Add the coffee, then pour all the water in one go.',
        'At four minutes, break the crust with a spoon and skim the foam.',
        'Let it settle a further five minutes. Do not plunge yet.',
        'Press gently to just below the surface and decant everything.'
      ]
    },
    espresso: {
      label: 'Espresso', water: 36, ratio: 2, grind: 'Very fine',
      temp: '93 °C', time: '0:28',
      steps: [
        'Dose, distribute and tamp level with steady pressure.',
        'Lock in and start the shot immediately — no idling in the group.',
        'Look for first drops around six seconds.',
        'Stop at double the dose in the cup. Taste before you adjust.'
      ]
    },
    cold: {
      label: 'Cold Brew', water: 300, ratio: 8, grind: 'Extra coarse',
      temp: 'Room temp', time: '18 hrs',
      steps: [
        'Combine coffee and cold water, stir until every ground is wet.',
        'Cover and leave on the counter for eighteen hours.',
        'Strain through a fine mesh, then once more through paper.',
        'Cut one-to-one with water or milk. Keeps ten days, chilled.'
      ]
    }
  };

  function initBrew() {
    var wrap = $('#brewMethods');
    if (!wrap) return;

    var state = { method: 'v60', cups: 2 };
    var out = {
      coffee: $('#rCoffee'), water: $('#rWater'), ratio: $('#rRatio'),
      coffeeLabel: $('#rCoffeeLabel'), waterLabel: $('#rWaterLabel'),
      grind: $('#rGrind'), temp: $('#rTemp'), time: $('#rTime'),
      steps: $('#rSteps'), cups: $('#cupsVal')
    };

    function render(animate) {
      var m = METHODS[state.method];
      var water = m.water * state.cups;
      var coffee = water / m.ratio;

      out.cups.textContent = state.cups;
      out.ratio.textContent = '1:' + (Math.round(m.ratio * 10) / 10);
      out.grind.textContent = m.grind;
      out.temp.textContent = m.temp;
      out.time.textContent = m.time;

      var espresso = state.method === 'espresso';
      var unit = espresso ? ' ml' : ' ml';
      out.coffeeLabel.textContent = espresso ? 'DOSE' : 'COFFEE';
      out.waterLabel.textContent = espresso ? 'YIELD' : 'WATER';
      if (hasGSAP && animate !== false) {
        countTo(out.coffee, coffee, ' g', 1);
        countTo(out.water, water, unit, 0);
      } else {
        out.coffee.textContent = coffee.toFixed(1) + ' g';
        out.water.textContent = Math.round(water) + unit;
      }

      out.steps.innerHTML = '';
      m.steps.forEach(function (s) {
        var li = document.createElement('li');
        li.textContent = s;
        out.steps.appendChild(li);
      });
      if (hasGSAP && animate !== false) {
        GS.from(out.steps.children, {
          y: 14, opacity: 0, duration: 0.55, stagger: 0.06, ease: 'power3.out'
        });
      }
    }

    function countTo(el, value, suffix, decimals) {
      var from = parseFloat(el.textContent) || 0;
      var o = { v: from };
      GS.to(o, {
        v: value, duration: 0.55, ease: 'power2.out',
        onUpdate: function () { el.textContent = o.v.toFixed(decimals) + suffix; }
      });
    }

    $$('.method', wrap).forEach(function (b) {
      b.addEventListener('click', function () {
        $$('.method', wrap).forEach(function (x) {
          x.classList.remove('is-active');
          x.setAttribute('aria-selected', 'false');
        });
        b.classList.add('is-active');
        b.setAttribute('aria-selected', 'true');
        state.method = b.dataset.method;
        render();
      });
    });

    $('#cupsUp').addEventListener('click', function () {
      state.cups = clamp(state.cups + 1, 1, 8); render();
    });
    $('#cupsDown').addEventListener('click', function () {
      state.cups = clamp(state.cups - 1, 1, 8); render();
    });

    render(false);

    if (!hasGSAP) return;
    GS.from('.brew__head > *', {
      y: 32, opacity: 0, duration: 0.9, stagger: 0.1, ease: 'power3.out',
      scrollTrigger: { trigger: '.brew__head', start: 'top 80%' }
    });
    GS.from('.method', {
      x: -26, opacity: 0, duration: 0.7, stagger: 0.06, ease: 'power3.out',
      scrollTrigger: { trigger: '.brew__tool', start: 'top 80%' }
    });
    GS.from('.brew__panelwrap', {
      y: 40, opacity: 0, duration: 0.95, ease: 'power3.out',
      scrollTrigger: { trigger: '.brew__tool', start: 'top 80%' }
    });
  }

  /* ================================================================= */
  /* 13 · CTA + footer                                                 */
  /* ================================================================= */
  function initOutro() {
    var form = $('#ctaForm');
    var note = $('#ctaNote');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = $('#ctaEmail').value.trim();
        var ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        note.textContent = ok
          ? 'WELCOME IN — FIRST BAG SHIPS FRIDAY.'
          : 'THAT EMAIL DOESN\'T LOOK RIGHT.';
        note.style.color = ok ? 'var(--crema)' : 'var(--cherry)';
        if (ok) { form.reset(); }
        if (hasGSAP) GS.fromTo(note, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.5 });
      });
    }

    if (!hasGSAP) return;
    GS.to('.cta__art', {
      yPercent: 12, scale: 1.12, ease: 'none',
      scrollTrigger: { trigger: '.cta', start: 'top bottom', end: 'bottom top', scrub: true }
    });
    GS.from('.cta__inner > *', {
      y: 38, opacity: 0, duration: 1, stagger: 0.1, ease: 'power3.out',
      scrollTrigger: { trigger: '.cta', start: 'top 70%' }
    });
    GS.from('.footer > div', {
      y: 30, opacity: 0, duration: 0.85, stagger: 0.07, ease: 'power3.out',
      scrollTrigger: { trigger: '.footer', start: 'top 88%' }
    });
  }

  /* ================================================================= */
  /* Boot                                                              */
  /* ================================================================= */
  function boot() {
    initScroll();
    initCursor();
    initChrome();
    initBeans();
    initHero();
    initStatements();
    initAltitude();
    initPanels();
    initLab();
    initCollection();
    initChamber();
    initJourney();
    initBrew();
    initOutro();

    initLoader(function () {
      if (window.__heroIntro) window.__heroIntro.play();
      initCards();
      // still renders are decoration; let the page settle first
      setTimeout(initBeanArt, 400);
    });

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (beans) beans.resize();
        fitHeroTitle();
        if (hasGSAP) ST.refresh();
      }, 160);
    });

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { if (hasGSAP) ST.refresh(); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
