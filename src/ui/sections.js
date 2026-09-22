import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { observeLines } from './split.js';

gsap.registerPlugin(ScrollTrigger);

const EASE = 'expo.out';

/* ------------------------------------------------------------------ *
 * headlines — masked line wipe, the reference's core move
 * ------------------------------------------------------------------ */
export function initHeadlines({ reducedMotion }) {
  document.querySelectorAll('[data-split-lines]').forEach((el) => {
    let tween = null;

    observeLines(el, (lines) => {
      tween?.scrollTrigger?.kill();
      tween?.kill();

      if (reducedMotion) {
        gsap.set(lines, { y: '0%', opacity: 1 });
        return;
      }

      gsap.set(lines, { y: '112%', opacity: 0 });
      tween = gsap.to(lines, {
        y: '0%',
        opacity: 1,
        duration: 1.25,
        ease: EASE,
        stagger: 0.085,
        scrollTrigger: {
          trigger: el,
          start: 'top 82%',
          once: true,
        },
      });
    });
  });
}

/* ------------------------------------------------------------------ *
 * generic enter reveals
 * ------------------------------------------------------------------ */
export function initReveals({ reducedMotion }) {
  document.querySelectorAll('[data-reveal]').forEach((el) => {
    if (reducedMotion) return gsap.set(el, { opacity: 1, y: 0 });
    gsap.fromTo(el,
      { opacity: 0, y: 26 },
      {
        opacity: 1, y: 0, duration: 1.1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
  });

  // the tagline under the hero mark splits into words
  const tag = document.querySelector('[data-split]');
  if (tag && !reducedMotion) {
    const words = tag.textContent.split(' ');
    tag.innerHTML = words
      .map((w) => `<span class="line-mask" style="display:inline-block"><span>${w}</span></span>`)
      .join(' ');
    gsap.set(tag, { opacity: 1 });
  }
}

/* ------------------------------------------------------------------ *
 * 01 — hero entrance
 * ------------------------------------------------------------------ */
export function playHero({ reducedMotion }) {
  const digits = document.querySelectorAll('[data-hero-digit]');
  const tagWords = document.querySelectorAll('.hero__tag .line-mask > span');
  const sigil = document.querySelector('.hero__sigil');
  const foot = document.querySelectorAll('.hero__foot > *');
  const navBits = document.querySelectorAll('.nav__brand, .nav__link, .nav__aside > *');

  if (reducedMotion) {
    gsap.set([digits, tagWords, sigil, foot, navBits], { opacity: 1, y: 0, scale: 1 });
    return;
  }

  gsap.set(digits, { yPercent: 118, opacity: 0 });
  gsap.set(tagWords, { yPercent: 118 });
  gsap.set(sigil, { opacity: 0, scale: 0.72, rotate: -35 });
  gsap.set(foot, { opacity: 0, y: 18 });
  gsap.set(navBits, { opacity: 0, y: -12 });

  gsap.timeline({ defaults: { ease: EASE } })
    .to(sigil, { opacity: 1, scale: 1, rotate: 0, duration: 1.6, ease: 'expo.out' })
    .to(digits, { yPercent: 0, opacity: 1, duration: 1.5, stagger: 0.1 }, 0.15)
    .to(tagWords, { yPercent: 0, duration: 1.1, stagger: 0.035 }, 0.62)
    .to(navBits, { opacity: 1, y: 0, duration: 1.0, stagger: 0.045 }, 0.35)
    .to(foot, { opacity: 1, y: 0, duration: 1.0, stagger: 0.1 }, 0.7);

  // the mark drifts up and dissolves as the descent begins
  gsap.to('.hero', {
    y: -90,
    opacity: 0,
    ease: 'none',
    scrollTrigger: {
      trigger: '#ch-01',
      start: 'top top',
      end: 'bottom top',
      scrub: 0.6,
    },
  });
}

/* ------------------------------------------------------------------ *
 * 03 — the assay dial
 * ------------------------------------------------------------------ */
export function initAssay({ reducedMotion }) {
  const root = document.getElementById('assay');
  if (!root) return;

  const items = [...root.querySelectorAll('[data-assay]')];
  const fill = document.getElementById('assay-fill');
  const num = document.getElementById('assay-num');
  const CIRC = 2 * Math.PI * 104;

  gsap.set(fill, { strokeDasharray: CIRC, strokeDashoffset: CIRC });

  const shown = { n: 0 };
  let active = -1;

  function select(i, { animate = true } = {}) {
    if (i === active) return;
    active = i;

    items.forEach((el, k) => el.classList.toggle('is-active', k === i));

    const value = parseFloat(items[i].dataset.value);
    const offset = CIRC * (1 - value / 100);

    gsap.to(fill, {
      strokeDashoffset: offset,
      duration: animate && !reducedMotion ? 1.3 : 0,
      ease: 'expo.out',
    });

    gsap.to(shown, {
      n: value,
      duration: animate && !reducedMotion ? 1.3 : 0,
      ease: 'expo.out',
      onUpdate: () => { num.textContent = shown.n.toFixed(1); },
    });
  }

  items.forEach((el, i) => {
    el.addEventListener('pointerenter', () => select(i));
    el.addEventListener('click', () => select(i));
    el.addEventListener('focus', () => select(i));
    el.tabIndex = 0;
  });

  ScrollTrigger.create({
    trigger: root,
    start: 'top 74%',
    once: true,
    onEnter: () => select(0),
  });
}

/* ------------------------------------------------------------------ *
 * 04 — divisions
 * ------------------------------------------------------------------ */
export function initDivisions({ reducedMotion }) {
  const rows = document.querySelectorAll('[data-division]');
  if (!rows.length) return;

  rows.forEach((row, i) => {
    const kicker = row.querySelector('.division__kicker');
    const title = row.querySelector('.division__title');
    const cta = row.querySelector('.division__cta');
    const idx = row.querySelector('.division__idx');
    const rule = row.querySelector('.division__rule');

    if (reducedMotion) {
      gsap.set([kicker, title, cta, idx], { opacity: 1, y: 0, scale: 1 });
      return;
    }

    gsap.timeline({
      scrollTrigger: { trigger: row, start: 'top 84%', once: true },
      defaults: { ease: EASE },
    })
      .fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 1.3, transformOrigin: 'left' })
      .fromTo(idx, { opacity: 0, scale: 0.5, rotate: 0 },
        { opacity: 1, scale: 1, rotate: 45, duration: 1.1 }, 0.05)
      .fromTo([kicker, title], { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 1.2, stagger: 0.07 }, 0.1)
      .fromTo(cta, { opacity: 0, x: -14 },
        { opacity: 1, x: 0, duration: 1.0 }, 0.28);

    // slight depth stagger as the block passes the viewport
    gsap.fromTo(row,
      { y: 40 },
      {
        y: -40,
        ease: 'none',
        scrollTrigger: {
          trigger: row,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 0.8,
        },
      });
  });
}

/* ------------------------------------------------------------------ *
 * chrome — nav state, rails, altitude
 * ------------------------------------------------------------------ */
export function initChrome({ world }) {
  const chapters = [...document.querySelectorAll('.chapter')];
  const navLinks = [...document.querySelectorAll('.nav__link')];
  const ticks = [...document.querySelectorAll('#rail-ticks li')];
  const progressBar = document.getElementById('rail-progress');
  const altitudeEl = document.getElementById('altitude');

  function setActive(n) {
    navLinks.forEach((l) => l.classList.toggle('is-active', Number(l.dataset.chapter) === n));
    ticks.forEach((t) => t.classList.toggle('is-active', Number(t.dataset.tick) === n));
  }

  chapters.forEach((sec) => {
    const n = Number(sec.dataset.chapter);
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 52%',
      end: 'bottom 52%',
      onToggle: ({ isActive }) => { if (isActive) setActive(n); },
    });
  });

  setActive(1);

  // page progress rail
  ScrollTrigger.create({
    trigger: document.body,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: ({ progress }) => {
      gsap.set(progressBar, { scaleY: progress });
    },
  });

  // altitude readout, sampled rather than written every frame
  let last = -1;
  gsap.ticker.add(() => {
    const a = world.getAltitude();
    if (a === last) return;
    last = a;
    altitudeEl.textContent = String(a).padStart(4, '0');
  });
}

/* ------------------------------------------------------------------ *
 * bind global scroll progress to the 3D flight
 * ------------------------------------------------------------------ */
export function bindWorldToScroll({ world }) {
  ScrollTrigger.create({
    trigger: document.body,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: ({ progress }) => world.setProgress(progress),
  });
}
