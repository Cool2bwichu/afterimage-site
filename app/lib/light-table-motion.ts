import type { FacetKey } from './light-table.ts';

/** Decorative only; no focusable clone, duplicated IDs or required motion. */
export function animateFacetToLane(source: HTMLElement, channel: FacetKey) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let target = document.querySelector<HTMLElement>(`[data-light-table-lane="${channel}"]`);
  if (!target?.getBoundingClientRect().height) target = document.querySelector('.ai-light-table__mobile-toggle');
  if (!target || !source.isConnected) return;
  const start = source.getBoundingClientRect();
  const end = target.getBoundingClientRect();
  const slip = document.createElement('span');
  slip.className = 'ai-facet-flight';
  slip.textContent = source.querySelector('strong')?.textContent ?? '';
  slip.setAttribute('aria-hidden', 'true');
  Object.assign(slip.style, {left:`${start.left}px`,top:`${start.top}px`,width:`${start.width}px`,height:`${Math.min(start.height,60)}px`});
  document.body.appendChild(slip);
  const animation = slip.animate([
    { transform: 'translate(0,0)', opacity:.9 },
    { transform:`translate(${end.left-start.left}px,${end.top-start.top}px) scale(.65)`, opacity:0 },
  ], {duration:380,easing:'cubic-bezier(.22,.8,.28,1)'});
  animation.finished.catch(() => {}).finally(() => slip.remove());
}
