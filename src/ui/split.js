/**
 * Line splitter.
 *
 * Wraps each *rendered* line of a text block in an overflow-hidden mask with
 * an inner span to translate — the masked wipe the reference uses on every
 * headline. Lines are detected by measuring word offsets, so the split follows
 * whatever the browser actually wrapped, and re-runs on resize.
 */

const originals = new WeakMap();

function wordsOf(text) {
  return text.split(/(\s+)/).filter((s) => s.length);
}

/** Rebuild `el` as a stack of masked lines. Returns the inner spans. */
export function splitLines(el) {
  if (!originals.has(el)) originals.set(el, el.innerHTML);

  // measure pass — every word becomes an inline span we can read offsets from
  const source = originals.get(el);
  const probe = document.createElement('div');
  probe.innerHTML = source;

  const text = probe.textContent.replace(/\s+/g, ' ').trim();
  el.textContent = '';

  const frag = document.createDocumentFragment();
  const wordEls = [];
  for (const w of wordsOf(text)) {
    if (!w.trim()) {
      frag.appendChild(document.createTextNode(' '));
      continue;
    }
    const s = document.createElement('span');
    s.style.display = 'inline-block';
    s.textContent = w;
    frag.appendChild(s);
    wordEls.push(s);
  }
  el.appendChild(frag);

  // group words into lines by their vertical offset
  const lines = [];
  let currentTop = null;
  for (const w of wordEls) {
    const top = w.offsetTop;
    if (currentTop === null || Math.abs(top - currentTop) > 2) {
      currentTop = top;
      lines.push([]);
    }
    lines[lines.length - 1].push(w.textContent);
  }

  // rebuild as masks
  el.textContent = '';
  const inners = [];
  for (const words of lines) {
    const mask = document.createElement('span');
    mask.className = 'line-mask';
    const inner = document.createElement('span');
    inner.textContent = words.join(' ');
    mask.appendChild(inner);
    el.appendChild(mask);
    inners.push(inner);
  }

  return inners;
}

/** Fired to force a re-split when wrapping may have changed without a resize. */
export const RESPLIT_EVENT = '999:resplit';

/**
 * Split now and re-split on resize, keeping the caller's callback informed so
 * it can rebuild its timeline against the new spans.
 *
 * Resizes are ignored unless the width moved meaningfully, since scrollbar and
 * mobile-toolbar jitter would otherwise thrash the DOM. A font swap changes
 * wrapping without changing the width, so that case is signalled explicitly
 * through RESPLIT_EVENT rather than by faking a resize.
 */
export function observeLines(el, onSplit) {
  let width = window.innerWidth;

  const run = () => onSplit(splitLines(el));
  run();

  const onResize = () => {
    if (Math.abs(window.innerWidth - width) < 24) return;
    width = window.innerWidth;
    run();
  };

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener(RESPLIT_EVENT, run);

  return () => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener(RESPLIT_EVENT, run);
  };
}
