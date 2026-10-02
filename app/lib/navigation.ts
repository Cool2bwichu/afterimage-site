export type Collection = 'atlases' | 'reels';
export type LibraryTab = 'watchlist' | 'likes' | 'afterimages';
export type CollectionRoute =
  | { kind: Collection | 'current' | 'home' | 'sky' }
  | { kind: 'library'; tab: LibraryTab }
  | { kind: 'atlas' | 'reel'; id: string | null };

const LIBRARY_ROUTES: Record<string, LibraryTab> = { '#library': 'watchlist', '#likes': 'likes', '#afterimages': 'afterimages' };

export function parseCollectionRoute(hash: string): CollectionRoute | null {
  if (hash === '#atlases' || hash === '#reels' || hash === '#current' || hash === '#home' || hash === '#sky') return { kind: hash.slice(1) as Collection | 'current' | 'home' | 'sky' };
  if (LIBRARY_ROUTES[hash]) return { kind: 'library', tab: LIBRARY_ROUTES[hash] };
  if (hash === '#atlas') return { kind: 'atlas', id: null };
  const match = /^#(atlas|reel)=([a-z0-9-]{1,64})$/.exec(hash);
  return match ? { kind: match[1] as 'atlas' | 'reel', id: match[2] } : null;
}

export function libraryHash(tab: LibraryTab): string {
  return tab === 'likes' ? 'likes' : tab === 'afterimages' ? 'afterimages' : 'library';
}
