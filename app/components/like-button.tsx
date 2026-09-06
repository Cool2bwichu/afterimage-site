import type { LikedFilm } from '../lib/taste-profile';

export function LikeButton({ film, liked, onToggle }: { film: LikedFilm; liked: boolean; onToggle: () => void }) {
  return <button type="button" className="like-film" aria-pressed={liked}
    aria-label={`${liked ? 'Unlike' : 'Like'} ${film.title}`}
    title={liked ? 'Remove from your taste history' : 'Seen it and loved it? Gently guide future reels.'}
    onClick={onToggle}><span aria-hidden="true">{liked ? '♥' : '♡'}</span> {liked ? 'Liked' : 'Like'}</button>;
}
