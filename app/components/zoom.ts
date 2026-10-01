'use client';

import { flushSync } from 'react-dom';

/**
 * One sky, many depths: moving from your sky into a reel, or from a film into its
 * Atlas, zooms toward the thing you chose; opening your sky from a reel zooms back
 * out. Uses view transitions where the browser has them, and simply changes the
 * view where it does not, when motion is paused, or when the device asks for less.
 */
export function zoomTransition(origin: Element | null | undefined, direction: 'in' | 'out', update: () => void) {
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.querySelector('.celestial-world[data-motion=off]') !== null;
  const start = (document as Document & { startViewTransition?: (callback: () => void) => { finished: Promise<void> } }).startViewTransition;
  if (reduced || typeof start !== 'function') {
    update();
    return;
  }
  const box = origin?.getBoundingClientRect();
  const x = box && box.width ? box.left + box.width / 2 : window.innerWidth / 2;
  const y = box && box.height ? box.top + box.height / 2 : window.innerHeight / 2;
  root.style.setProperty('--zoom-x', `${Math.round(x)}px`);
  root.style.setProperty('--zoom-y', `${Math.round(y)}px`);
  root.dataset.zoom = direction;
  try {
    const transition = start.call(document, () => flushSync(update));
    transition.finished.finally(() => { if (root.dataset.zoom === direction) delete root.dataset.zoom; });
  } catch {
    delete root.dataset.zoom;
    update();
  }
}
