import { gsap } from 'gsap';

/**
 * The crosshair cursor from the reference — a small dot that opens into a
 * labelled ring over anything interactive.
 */
export function initCursor() {
  const el = document.getElementById('cursor');
  if (!el || window.matchMedia('(hover: none)').matches) return;

  const label = el.querySelector('.cursor__label');
  const setX = gsap.quickTo(el, 'x', { duration: 0.42, ease: 'power3' });
  const setY = gsap.quickTo(el, 'y', { duration: 0.42, ease: 'power3' });

  let shown = false;
  window.addEventListener('pointermove', (e) => {
    setX(e.clientX);
    setY(e.clientY);
    if (!shown) {
      shown = true;
      gsap.to(el, { opacity: 1, duration: 0.5 });
    }
  }, { passive: true });

  window.addEventListener('pointerleave', () => {
    shown = false;
    gsap.to(el, { opacity: 0, duration: 0.3 });
  });

  const SELECTOR = 'a, button, [data-cursor], [data-assay], [data-division]';

  document.addEventListener('pointerover', (e) => {
    const hit = e.target.closest?.(SELECTOR);
    if (!hit) return;
    label.textContent = hit.dataset.cursor || '';
    el.classList.add('is-hover');
  });

  document.addEventListener('pointerout', (e) => {
    const hit = e.target.closest?.(SELECTOR);
    if (!hit) return;
    if (e.relatedTarget?.closest?.(SELECTOR) === hit) return;
    el.classList.remove('is-hover');
  });
}
