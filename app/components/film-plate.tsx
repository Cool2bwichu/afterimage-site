'use client';

import { useId, useMemo } from 'react';
import { PLATE_SIZE, facetWords, plateMarkup, reelMotifs, type PlateMotif, type PlateShape } from '../lib/plate';

export type PlateFilm = { title: string; year: string; facets?: Partial<Record<string, { label: string; traits: readonly string[] }>> };

/**
 * A film's plate: its afterimage, drawn from its title, the reel's colours and the words of
 * its four qualities. Decorative unless given a label; the film's name is always beside it.
 */
/** The motifs of a reel's films, shared out so no two plates of one reel draw the same picture. */
export function useReelMotifs(films: readonly PlateFilm[]): PlateMotif[] {
  return useMemo(() => reelMotifs(films.map(film => ({ title: film.title, year: film.year, words: facetWords(film.facets) }))), [films]);
}

export function FilmPlate({ film, palette, index, motif, shape = 'poster', grain, ghost, label, className }: {
  film: PlateFilm; palette?: readonly string[]; index?: number; motif?: PlateMotif; shape?: PlateShape;
  grain?: boolean; ghost?: boolean; label?: string; className?: string;
}) {
  const id = `plate${useId().replace(/[^a-z0-9]/gi, '')}`;
  const words = useMemo(() => facetWords(film.facets), [film.facets]);
  const markup = useMemo(() => plateMarkup({ title: film.title, year: film.year, palette, words, index, motif }, { shape, id, grain, ghost }),
    [film.title, film.year, palette, words, index, motif, shape, id, grain, ghost]);
  const { width, height } = PLATE_SIZE[shape];
  return <svg className={`film-plate${className ? ` ${className}` : ''}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice"
    role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false"
    dangerouslySetInnerHTML={{ __html: markup }} />;
}
