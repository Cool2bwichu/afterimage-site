'use client';

import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import type { AtlasStop } from '../lib/atlas-trail';
import { OrbitMark } from './celestial';

export type CollectionMenuProps = {
  atlasCount: number; reelCount: number; savedCount: number; likedCount: number; starCount: number; afterimageCount: number;
  recentAtlas?: AtlasStop;
  onNavigate: (hash: string, opener: HTMLElement) => void;
};

export function CollectionMenu({ atlasCount, reelCount, savedCount, likedCount, starCount, afterimageCount, recentAtlas, onNavigate }: CollectionMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  function visit(event: MouseEvent<HTMLAnchorElement>, hash: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); setOpen(false);
    if (trigger.current) onNavigate(hash, trigger.current);
  }
  const entries = [
    { hash: '#sky', label: 'Your sky', count: starCount, symbol: '✧' },
    { hash: '#current', label: 'Current reel', count: null, symbol: '↗' },
    { hash: '#atlases', label: 'My Atlases', count: atlasCount, symbol: '✦' },
    { hash: '#reels', label: 'My reels', count: reelCount, symbol: '▤' },
    { hash: '#library', label: 'Saved films', count: savedCount, symbol: '+' },
    { hash: '#likes', label: 'Liked films', count: likedCount, symbol: '♡' },
    { hash: '#afterimages', label: 'Afterimages', count: afterimageCount, symbol: '◎' },
  ];
  return <div className="collection-menu" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); const links = Array.from(root.current?.querySelectorAll<HTMLAnchorElement>('nav a') ?? []);
      const index = links.indexOf(document.activeElement as HTMLAnchorElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1 : index < 0 ? (event.key === 'ArrowDown' ? 0 : links.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
      links[next]?.focus();
    }
  }}>
    <button type="button" ref={trigger} className="collection-menu-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>Your reel <svg viewBox="0 0 12 8" aria-hidden="true"><path d="m1 1 5 5 5-5" /></svg></button>
    {open ? <nav id={id} className="collection-menu-panel" aria-label="Your AFTERIMAGE">
      <p className="collection-menu-heading"><OrbitMark />Your AFTERIMAGE</p>
      {entries.map(entry => <a href={entry.hash} key={entry.hash} onClick={event => visit(event, entry.hash)}><span aria-hidden="true" className="collection-menu-symbol">{entry.symbol}</span><span>{entry.label}</span>{entry.count !== null ? <small>{entry.count}</small> : null}</a>)}
      {recentAtlas ? <div className="collection-menu-recent"><span>Return to your Atlas</span><a href={`#atlas=${recentAtlas.id}`} onClick={event => visit(event, `#atlas=${recentAtlas.id}`)}><strong>{recentAtlas.atlas.anchor.title}</strong><span aria-hidden="true">↗</span></a></div> : null}
      <a className="collection-menu-home" href="#home" onClick={event => visit(event, '#home')}>Back to the beginning <span aria-hidden="true">↗</span></a>
    </nav> : null}
  </div>;
}
