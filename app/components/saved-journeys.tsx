'use client';

import { useEffect, useRef, useState } from 'react';
import { MAX_ATLAS_MAPS, type AtlasStop } from '../lib/atlas-trail';
import { MAX_SAVED_REELS, reelCaption, type SavedReel } from '../lib/reel-history';
import { parseAtlasInputRequest } from '../lib/atlas';
import type { Collection } from '../lib/navigation';
import { OrbitMark } from './celestial';

export function SavedJourneys({ collection, opener, atlases, reels, reelLocked, notice, onClose, onNavigate }: {
  collection: Collection | null; opener: HTMLElement | null; atlases: AtlasStop[]; reels: SavedReel[];
  reelLocked: boolean; notice: string; onClose: () => void; onNavigate: (hash: string, opener: HTMLElement) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [query, setQuery] = useState('');
  const isOpen = Boolean(collection);
  useEffect(() => {
    if (!isOpen) return;
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; element?.showModal(); heading.current?.focus();
    return () => { element?.close(); document.body.style.overflow = overflow; if (opener?.isConnected) opener.focus(); };
  }, [isOpen, opener]);
  if (!collection) return null;
  const isAtlas = collection === 'atlases';
  const match = (text: string) => text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const maps = [...atlases].reverse().filter(map => match(`${map.atlas.anchor.title} ${map.atlas.anchor.year}`));
  const savedReels = [...reels].reverse().filter(reel => match(`${reelCaption(reel)} ${reel.state.result?.recommendations.map(film => film.title).join(' ')}`));
  const empty = isAtlas ? !maps.length : !savedReels.length;
  return <dialog ref={dialog} className="saved-journeys" aria-labelledby="saved-journeys-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><p><OrbitMark />Your collection</p><h2 id="saved-journeys-title" ref={heading} tabIndex={-1}>{isAtlas ? 'My Atlases' : 'My reels'}</h2></div><button type="button" onClick={onClose} aria-label={`Close ${isAtlas ? 'My Atlases' : 'My reels'}`}>Close <span aria-hidden="true">×</span></button></header>
    <p className="journeys-intro">{isAtlas ? 'A film you loved. A path worth returning to.' : 'Five films, a particular feeling. Pick up where you left off.'}</p>
    {notice ? <p role="status">{notice}</p> : null}
    <label className="journeys-search"><span>Find {isAtlas ? 'an Atlas' : 'a reel'}</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={isAtlas ? 'Film title or year' : 'A film or a feeling'} /></label>
    {!isAtlas && reelLocked ? <p role="status">A discovery is developing. Your saved reels will be ready to open when it finishes.</p> : null}
    <ol className="journeys-list">{isAtlas ? maps.map((map, index) => {
      const request = parseAtlasInputRequest(map.inputKey, map.atlas.anchor);
      return <li key={map.id}><a href={`#atlas=${map.id}`} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onNavigate(`#atlas=${map.id}`, event.currentTarget); }}><span className="journey-number">{String(index + 1).padStart(2, '0')}</span><span className="journey-copy"><strong>{map.atlas.anchor.title} <small>{map.atlas.anchor.year}</small></strong><span>{request?.creativeBrief || map.atlas.thesis}</span><small>6 connections · Continue exploring</small></span><span className="journey-orbit" aria-hidden="true"><OrbitMark /></span><span aria-hidden="true">↗</span></a></li>;
    }) : savedReels.map((reel, index) => <li key={reel.id}><a href={`#reel=${reel.id}`} aria-disabled={reelLocked} onClick={event => { if (reelLocked) { event.preventDefault(); return; } if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onNavigate(`#reel=${reel.id}`, event.currentTarget); }}><span className="journey-number">{String(index + 1).padStart(2, '0')}</span><span className="journey-copy"><strong>{reelCaption(reel)}</strong><span>{reel.state.result?.recommendations.map(film => film.title).join(' · ')}</span><small>{new Date(reel.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · 5 films</small></span><span className="journey-palette" aria-hidden="true">{reel.state.result?.palette.map((color, i) => <i key={i} style={{ backgroundColor: color }} />)}</span><span aria-hidden="true">↗</span></a></li>)}</ol>
    {empty ? <div className="journeys-empty"><OrbitMark /><h3>{query ? 'Nothing here matches yet.' : isAtlas ? 'Your next connection starts with a film.' : 'Your first reel is still ahead of you.'}</h3><p>{query ? 'Try another title or feeling.' : isAtlas ? 'Explore connections around any film. Its Atlas will stay here for your return.' : 'Completed reels are kept here automatically from now on.'}</p><button type="button" onClick={event => onNavigate('#current', event.currentTarget)}>Return to your reel ↗</button></div> : null}
    <footer>Kept in this browser · Your {isAtlas ? MAX_ATLAS_MAPS : MAX_SAVED_REELS} most recent {isAtlas ? 'Atlases' : 'reels'}. {isAtlas ? 'Your selected connection and lens are remembered.' : 'Starting over keeps your collection.'}</footer>
  </dialog>;
}
