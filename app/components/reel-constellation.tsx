'use client';

import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { threadFigure } from '../lib/sky';
import type { RecommendationV2 } from '../lib/reel-state';
import { StarGlyph } from './celestial';
import type { HoldProps } from './film-verbs';
import { saveStarChart } from './star-chart';
import { useElementSize } from './use-element-size';

/**
 * The reel drawn as a constellation named after its persona. The thread follows the
 * ranking, 01 to 05; its shape is decorative and never measures similarity.
 */
export function ReelConstellation({ seed, name, insight, palette, films, selected, onSelect, onNotice, onOpenSky, onCollide, hold }: {
  seed: string; name: string; insight: string; palette: string[]; films: RecommendationV2[];
  selected: number; onSelect: (index: number) => void; onNotice: (message: string) => void; onOpenSky: (opener: HTMLElement) => void;
  /** Drop one star on another to find the film between them. */
  onCollide?: (first: number, second: number, opener: HTMLElement) => void;
  hold?: (payload: { film: RecommendationV2; index: number }) => HoldProps;
}) {
  const [saving, setSaving] = useState(false);
  const stars = useRef<Array<HTMLButtonElement | null>>([]);
  const [chart, size] = useElementSize<HTMLDivElement>();
  // A drag from one star toward another: where it began, where the pointer is, and the star beneath it.
  const press = useRef<{ index: number; x: number; y: number; pointerId: number } | null>(null);
  const dragged = useRef(false);
  const [drag, setDrag] = useState<{ from: number; x: number; y: number; over: number | null } | null>(null);
  function starAt(x: number, y: number): number | null {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('.reel-constellation-star');
    const index = element ? stars.current.indexOf(element as HTMLButtonElement) : -1;
    return index >= 0 ? index : null;
  }
  function dragStart(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (!onCollide || event.button !== 0) return;
    press.current = { index, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    dragged.current = false;
  }
  function dragMove(event: PointerEvent<HTMLButtonElement>) {
    const start = press.current;
    if (!start || start.pointerId !== event.pointerId) return;
    if (!dragged.current && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 10) return;
    if (!dragged.current) { dragged.current = true; event.currentTarget.setPointerCapture(event.pointerId); }
    const box = chart.current?.getBoundingClientRect();
    if (!box) return;
    const over = starAt(event.clientX, event.clientY);
    setDrag({ from: start.index, x: event.clientX - box.left, y: event.clientY - box.top, over: over === start.index ? null : over });
  }
  function dragEnd(event: PointerEvent<HTMLButtonElement>) {
    const start = press.current;
    press.current = null;
    if (!start || !dragged.current) return;
    const over = starAt(event.clientX, event.clientY);
    setDrag(null);
    if (over !== null && over !== start.index) onCollide?.(start.index, over, event.currentTarget);
  }
  // Fit the figure to the band: uniform scale first, then a gentle horizontal stretch so a
  // tall figure can breathe across a wide band. Returned as percentages of the chart.
  const points = useMemo(() => {
    // A tall thread is turned to lie along the band; its shape is unchanged.
    const drawn = threadFigure(seed, films.length);
    const tall = Math.max(...drawn.map(point => point.y)) - Math.min(...drawn.map(point => point.y)) > Math.max(...drawn.map(point => point.x)) - Math.min(...drawn.map(point => point.x));
    const figure = tall ? drawn.map(point => ({ x: point.y, y: -point.x })) : drawn;
    const width = size.width || 800;
    const height = size.height || 176;
    const xs = figure.map(point => point.x);
    const ys = figure.map(point => point.y);
    const spanX = Math.max(.2, Math.max(...xs) - Math.min(...xs));
    const spanY = Math.max(.2, Math.max(...ys) - Math.min(...ys));
    const availableX = width * .7;
    const availableY = height * .66;
    const uniform = Math.min(availableX / spanX, availableY / spanY);
    const scaleX = Math.min(availableX / spanX, uniform * 1.8);
    const midX = (Math.max(...xs) + Math.min(...xs)) / 2;
    const midY = (Math.max(...ys) + Math.min(...ys)) / 2;
    return figure.map(point => ({ x: 50 + (point.x - midX) * scaleX / width * 100, y: 50 + (point.y - midY) * uniform / height * 100 }));
  }, [seed, films.length, size.width, size.height]);
  const colors = films.map((_, index) => /^#[0-9a-f]{6}$/i.test(palette[index] ?? '') ? palette[index] : '#dec6a0');

  function move(event: KeyboardEvent, index: number) {
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % films.length
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index + films.length - 1) % films.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? films.length - 1 : null;
    if (next === null) return;
    event.preventDefault(); onSelect(next); stars.current[next]?.focus();
  }

  async function saveChart() {
    if (saving) return;
    setSaving(true);
    try {
      const outcome = await saveStarChart({ seed, persona: name, insight, palette, films: films.map(({ title, year }) => ({ title, year })) });
      if (outcome !== 'cancelled') onNotice(outcome === 'shared' ? 'Your star chart is ready to share.' : 'Your star chart has been saved as an image.');
    } catch {
      onNotice('The star chart could not be drawn in this browser.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="reel-constellation" aria-labelledby="reel-constellation-name" style={{ '--constellation-color': colors[selected] ?? '#dec6a0' } as CSSProperties}>
    <div className="reel-constellation-copy">
      <p className="reel-constellation-kicker"><StarGlyph />Your reel, as a constellation</p>
      <h2 id="reel-constellation-name">{name}</h2>
      <p className="reel-constellation-caption"><span className="reel-constellation-palette" aria-hidden="true">{colors.map((color, index) => <i key={index} style={{ backgroundColor: color }} />)}</span>Five films, a thread between them.</p>
      {onCollide ? <p className="reel-constellation-hint">Drag one star onto another to collide them. Hold a film for more.</p> : null}
    </div>
    <div className="reel-constellation-chart" key={seed} ref={chart}>
      <svg className="reel-constellation-graticule" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <ellipse cx="50" cy="50" rx="46" ry="44" /><ellipse cx="50" cy="50" rx="30" ry="44" /><ellipse cx="50" cy="50" rx="12" ry="44" />
        <path d="M4 50h92M4 30q46 -8 92 0M4 70q46 8 92 0" />
      </svg>
      {size.width ? <svg className="reel-constellation-thread" viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
        {points.slice(1).map((point, index) => <line key={index} x1={points[index].x / 100 * size.width} y1={points[index].y / 100 * size.height} x2={point.x / 100 * size.width} y2={point.y / 100 * size.height} pathLength={1}
          className={selected === index || selected === index + 1 ? 'is-lit' : ''} style={{ '--i': index } as CSSProperties} />)}
        {drag ? <line className="reel-constellation-pull" x1={points[drag.from].x / 100 * size.width} y1={points[drag.from].y / 100 * size.height} x2={drag.x} y2={drag.y} /> : null}
      </svg> : null}
      {films.map((film, index) => { const held = hold?.({ film, index }); return <button type="button" key={`${film.title}|${film.year}`} ref={element => { stars.current[index] = element; }}
        className={`reel-constellation-star${index === 0 ? ' is-first' : ''}${drag?.from === index ? ' is-pulled' : ''}${drag?.over === index ? ' is-target' : ''}`} aria-pressed={selected === index}
        aria-label={`${film.title}, film ${index + 1} of ${films.length}`} {...held}
        onPointerDown={event => { held?.onPointerDown(event); dragStart(event, index); }}
        onPointerMove={event => { held?.onPointerMove(event); dragMove(event); }}
        onPointerUp={event => { held?.onPointerUp(); dragEnd(event); }}
        onPointerCancel={() => { held?.onPointerCancel(); press.current = null; setDrag(null); }}
        onClickCapture={event => { if (dragged.current) { event.preventDefault(); event.stopPropagation(); dragged.current = false; return; } held?.onClickCapture(event); }}
        onClick={() => onSelect(index)} onKeyDown={event => { held?.onKeyDown(event); if (!event.defaultPrevented) move(event, index); }}
        style={{ left: `${points[index].x}%`, top: `${points[index].y}%`, '--star-color': colors[index], '--i': index } as CSSProperties}>
        <span className="reel-constellation-glow" aria-hidden="true" />
        <span className="reel-constellation-core" aria-hidden="true" />
        <span className="reel-constellation-reticle" aria-hidden="true" />
        <span className={`reel-constellation-label${points[index].x > 64 ? ' is-left' : ''}${points[index].y > 62 ? ' is-below' : ''}`}><small>{String(index + 1).padStart(2, '0')}</small>{film.title}</span>
      </button>; })}
    </div>
    <div className="reel-constellation-actions">
      <button type="button" onClick={() => void saveChart()} disabled={saving}>{saving ? 'Drawing your chart…' : 'Save star chart'} <span aria-hidden="true">↓</span></button>
      <a href="#sky" onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onOpenSky(event.currentTarget); }}>See it in your sky <span aria-hidden="true">✦</span></a>
    </div>
  </section>;
}
