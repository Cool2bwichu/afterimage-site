import type { FacetKey } from './light-table.ts';

/** Decorative only; no focusable clone, duplicated IDs or required motion. */
export function animateFacetToLane(source: HTMLElement, channel: FacetKey) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const candidates = document.querySelectorAll<HTMLElement>(`[data-light-table-lane="${channel}"], [data-light-table-summary="${channel}"], .ai-light-table__mobile-toggle, .ai-light-table__desktop-toggle`);
  const target = Array.from(candidates).find(element => {
    const bounds = element.getBoundingClientRect();
    return bounds.height > 0 && bounds.width > 0 && bounds.bottom > 0 && bounds.top < window.innerHeight;
  });
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
