import { gsap } from 'gsap';

/**
 * Assay-counter preloader: 000‰ → 999‰, then the panel lifts away and hands
 * the hero its entrance.
 */
export function runPreloader({ onComplete }) {
  const root = document.getElementById('preloader');
  const count = document.getElementById('preload-count');
  const bar = document.getElementById('preload-bar');
  const digits = root.querySelectorAll('[data-digit]');

  document.body.classList.add('is-loading');

  const value = { n: 0 };
  const tl = gsap.timeline({
    onComplete: () => {
      document.body.classList.remove('is-loading');
      root.remove();
      onComplete?.();
    },
  });

  tl.to(digits, {
    opacity: 1,
    y: 0,
    duration: 0.9,
    ease: 'power3.out',
    stagger: 0.09,
  })
    .to(value, {
      n: 999,
      duration: 2.0,
      ease: 'power2.inOut',
      onUpdate: () => {
        count.textContent = String(Math.round(value.n)).padStart(3, '0');
      },
    }, 0.2)
    .to(bar, { width: '100%', duration: 2.0, ease: 'power2.inOut' }, 0.2)
    .to(digits, {
      y: '-110%',
      opacity: 0,
      duration: 0.7,
      ease: 'power3.inOut',
      stagger: 0.05,
    }, '+=0.25')
    .to('.preloader__meta, .preloader__bar', {
      opacity: 0,
      duration: 0.4,
      ease: 'power2.out',
    }, '<')
    .to(root, {
      clipPath: 'inset(0 0 100% 0)',
      duration: 1.0,
      ease: 'expo.inOut',
    }, '-=0.15');

  return tl;
}
