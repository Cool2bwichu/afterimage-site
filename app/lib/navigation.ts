export type Collection = 'atlases' | 'reels';
export type LibraryTab = 'watchlist' | 'likes';
export type CollectionRoute =
  | { kind: Collection | 'current' | 'home' }
  | { kind: 'library'; tab: LibraryTab }
  | { kind: 'atlas' | 'reel'; id: string | null };

export function parseCollectionRoute(hash: string): CollectionRoute | null {
  if (hash === '#atlases' || hash === '#reels' || hash === '#current' || hash === '#home') return { kind: hash.slice(1) as Collection | 'current' | 'home' };
  if (hash === '#library' || hash === '#likes') return { kind: 'library', tab: hash === '#likes' ? 'likes' : 'watchlist' };
  if (hash === '#atlas') return { kind: 'atlas', id: null };
  const match = /^#(atlas|reel)=([a-z0-9-]{1,64})$/.exec(hash);
  return match ? { kind: match[1] as 'atlas' | 'reel', id: match[2] } : null;
}
