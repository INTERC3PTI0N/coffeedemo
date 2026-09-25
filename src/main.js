import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

import { createWorld } from './three/world.js';
import { createVault } from './three/vault.js';
import { RESPLIT_EVENT } from './ui/split.js';
import { runPreloader } from './ui/preloader.js';
import { initCursor } from './ui/cursor.js';
import { initMenu } from './ui/menu.js';
import {
  initHeadlines,
  initReveals,
  initAssay,
  initDivisions,
  initStageHandoff,
  initChrome,
  playHero,
  bindWorldToScroll,
} from './ui/sections.js';

gsap.registerPlugin(ScrollTrigger);

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ *
 * smooth scroll — Lenis drives GSAP's ticker so scrub stays in step
 * ------------------------------------------------------------------ */
const lenis = new Lenis({
  duration: reducedMotion ? 0 : 1.25,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: !reducedMotion,
  wheelMultiplier: 0.95,
  touchMultiplier: 1.35,
});

lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

const scrollTo = (target) => lenis.scrollTo(target, { offset: 0, duration: 1.6 });

/* ------------------------------------------------------------------ *
 * 3D
 * ------------------------------------------------------------------ */
const world = createWorld(document.getElementById('gl'), { reducedMotion });

// Pointer does double duty: it parallaxes the camera and drags a furrow
// through the dust where it meets the plate.
if (!reducedMotion) {
  window.addEventListener('pointermove', (e) => {
    world.setPointer(
      (e.clientX / window.innerWidth) * 2 - 1,
      -((e.clientY / window.innerHeight) * 2 - 1),
    );
  }, { passive: true });
  window.addEventListener('pointerleave', () => world.clearPointer());

  // Strike the plate: a transient impulse where the pointer meets it.
  window.addEventListener('pointerdown', (e) => {
    if (e.target.closest('a, button, [data-assay], [data-division], #vault-stage')) return;
    world.strike();
  }, { passive: true });
}

createVault(document.getElementById('vault-stage'), { reducedMotion });

/* ------------------------------------------------------------------ *
 * UI
 * ------------------------------------------------------------------ */
initCursor();
initMenu({ scrollTo });
initHeadlines({ reducedMotion });
initReveals({ reducedMotion });
initAssay({ reducedMotion });
initDivisions({ reducedMotion });
initStageHandoff({ reducedMotion });
initChrome({ world });
bindWorldToScroll({ world });

// in-page anchors route through Lenis
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const href = a.getAttribute('href');
    if (!href || href === '#') return;
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    scrollTo(target);
  });
});

/* ------------------------------------------------------------------ *
 * go
 * ------------------------------------------------------------------ */
lenis.stop();

const start = () => {
  lenis.start();
  ScrollTrigger.refresh();
  playHero({ reducedMotion });
};

if (reducedMotion) {
  document.getElementById('preloader')?.remove();
  document.body.classList.remove('is-loading');
  start();
} else {
  runPreloader({ onComplete: start });
}

// A font swap rewraps every headline without changing the viewport width, so
// force a re-split rather than relying on a resize the guards would ignore.
document.fonts?.ready.then(() => {
  window.dispatchEvent(new Event(RESPLIT_EVENT));
  ScrollTrigger.refresh();
});
