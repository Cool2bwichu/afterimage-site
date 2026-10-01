'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';

export type VerbFilm = { title: string; year: string; tmdbId?: number };
export type FilmVerb = { id: string; label: string; detail?: string; disabled?: boolean; run: (opener: HTMLElement) => void };
export type VerbMenu = { film: VerbFilm; verbs: FilmVerb[]; x: number; y: number; opener: HTMLElement };

const HOLD_MS = 480;
const SLOP_PX = 9;

/**
 * Press and hold a film (or right-click it, or press the menu key while it has focus)
 * to see everything you can do with it. Nothing else on screen grows a menu.
 * Returns `bind(payload)`, whose props go on the film's element; one press at a time.
 */
export function useHold<T>(onHold: (payload: T, element: HTMLElement, point: { x: number; y: number }) => void) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);
  const latest = useRef(onHold);
  useEffect(() => { latest.current = onHold; }, [onHold]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const cancel = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = null; start.current = null; };
  return (payload: T) => ({
    'data-hold': '',
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0 || event.pointerType === 'mouse') return;
      held.current = false;
      start.current = { x: event.clientX, y: event.clientY };
      const element = event.currentTarget;
      const point = { x: event.clientX, y: event.clientY };
      timer.current = window.setTimeout(() => {
        held.current = true;
        timer.current = null;
        navigator.vibrate?.(8);
        latest.current(payload, element, point);
      }, HOLD_MS);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (start.current && Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > SLOP_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu(event: MouseEvent<HTMLElement>) {
      event.preventDefault();
      cancel();
      if (held.current) return;
      latest.current(payload, event.currentTarget, { x: event.clientX, y: event.clientY });
    },
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
        event.preventDefault();
        const box = event.currentTarget.getBoundingClientRect();
        latest.current(payload, event.currentTarget, { x: box.left + Math.min(box.width / 2, 120), y: box.top + Math.min(box.height / 2, 80) });
      }
    },
    // The click that ends a long press is not a tap.
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (held.current) { event.preventDefault(); event.stopPropagation(); held.current = false; }
    },
  });
}

export type HoldProps = ReturnType<ReturnType<typeof useHold<unknown>>>;

/** The film's verbs, opened where the film was held. */
export function FilmVerbs({ menu, onClose }: { menu: VerbMenu | null; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!menu || !panel.current) return;
    const box = panel.current.getBoundingClientRect();
    const margin = 12;
    const left = Math.min(Math.max(margin, menu.x - box.width / 2), window.innerWidth - box.width - margin);
    const below = menu.y + 14;
    const top = below + box.height + margin < window.innerHeight ? below : Math.max(margin, menu.y - box.height - 14);
    setPosition({ left, top });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const first = panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    first?.focus({ preventScroll: true });
    const outside = (event: globalThis.PointerEvent) => { if (!panel.current?.contains(event.target as Node)) onClose(); };
    const scroll = () => onClose();
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', scroll);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', scroll);
      if (menu.opener.isConnected) menu.opener.focus({ preventScroll: true });
    };
  }, [menu, onClose]);

  if (!menu) return null;
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown' ? (index + 1) % items.length : event.key === 'ArrowUp' ? (index - 1 + items.length) % items.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null;
    if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); onClose(); return; }
    if (next !== null && items.length) { event.preventDefault(); items[next].focus(); }
  };
  return <div ref={panel} className="film-verbs" role="menu" aria-label={`${menu.film.title}: what you can do`} onKeyDown={move}
    style={{ left: position?.left ?? -9999, top: position?.top ?? -9999, '--x': `${menu.x}px` } as CSSProperties}>
    <p className="film-verbs-title" aria-hidden="true">{menu.film.title} <small>{menu.film.year}</small></p>
    {menu.verbs.map(verb => <button key={verb.id} type="button" role="menuitem" className={`film-verb film-verb--${verb.id}`} disabled={verb.disabled}
      onClick={() => { const opener = menu.opener; onClose(); verb.run(opener); }}>
      <span>{verb.label}</span>{verb.detail ? <small>{verb.detail}</small> : null}
    </button>)}
  </div>;
}
