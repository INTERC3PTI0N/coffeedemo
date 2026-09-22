import { gsap } from 'gsap';

/** Full-screen index overlay. */
export function initMenu({ scrollTo }) {
  const toggle = document.getElementById('menu-toggle');
  const menu = document.getElementById('menu');
  if (!toggle || !menu) return;

  const items = menu.querySelectorAll('.menu__list a');
  const meta = menu.querySelectorAll('.menu__col--meta > *');
  let open = false;
  let tl = null;

  function setOpen(next) {
    if (next === open) return;
    open = next;
    tl?.kill();

    toggle.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-hidden', String(!open));
    toggle.querySelector('span').textContent = open ? 'Close' : 'Menu';
    document.body.classList.toggle('is-menu-open', open);

    if (open) {
      menu.classList.add('is-open');
      tl = gsap.timeline()
        .fromTo(menu,
          { clipPath: 'inset(0 0 100% 0)' },
          { clipPath: 'inset(0 0 0% 0)', duration: 0.9, ease: 'expo.inOut' })
        .fromTo(items,
          { y: '110%' },
          { y: '0%', duration: 0.9, ease: 'expo.out', stagger: 0.055 }, '-=0.5')
        .fromTo(meta,
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.06 }, '-=0.6');
    } else {
      tl = gsap.timeline({ onComplete: () => menu.classList.remove('is-open') })
        .to(items, { y: '-110%', duration: 0.5, ease: 'power3.in', stagger: 0.03 })
        .to(meta, { opacity: 0, duration: 0.3 }, '<')
        .to(menu, { clipPath: 'inset(0 0 100% 0)', duration: 0.7, ease: 'expo.inOut' }, '-=0.2');
    }
  }

  toggle.addEventListener('click', () => setOpen(!open));

  menu.querySelectorAll('[data-menu-link]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      setOpen(false);
      gsap.delayedCall(0.35, () => scrollTo(a.getAttribute('href')));
    });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
}
