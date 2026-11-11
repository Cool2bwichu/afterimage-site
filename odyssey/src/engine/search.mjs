// Finding a star by name. Titles, directors and years are matched without
// regard to accents or case; a query can also name a trait ("heist", "dread").

export function fold(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const ARTICLE = /^(the|a|an|le|la|les|il|lo|el|los|las|der|die|das|un|une) /;

/** A slug for a film: "paris-texas-1984". */
export function slugOf(title, year) {
  let base = fold(title).replace(/ /g, '-');
  if (!base) {
    // A title with no Latin letters or digits still needs an address of its own.
    let hash = 2166136261;
    for (const char of String(title || '')) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
    base = `film-${(hash >>> 0).toString(36)}`;
  }
  return year ? `${base}-${year}` : base;
}

export function createSearch(universe) {
  let entries = [];
  let indexed = 0;
  const refresh = () => {
    for (let i = indexed; i < universe.count; i += 1) {
      const film = universe.films[i];
      const title = fold(film.t);
      entries.push({ i, title, bare: title.replace(ARTICLE, ''), director: fold(film.d), year: String(film.y || '') });
    }
    indexed = universe.count;
  };

  /** @returns {Array<{ star: number, score: number }>} best matches first */
  function films(query, limit = 8) {
    refresh();
    const q = fold(query);
    if (!q) return [];
    const yearMatch = q.match(/\b(18|19|20)\d\d\b/);
    const year = yearMatch ? yearMatch[0] : '';
    const words = q.replace(/\b(18|19|20)\d\d\b/, '').trim();
    const found = [];
    for (const entry of entries) {
      let score = 0;
      if (words) {
        if (entry.title === words || entry.bare === words) score = 100;
        else if (entry.title.startsWith(words) || entry.bare.startsWith(words)) score = 80 - Math.min(20, entry.title.length - words.length) * 0.5;
        else if (` ${entry.title}`.includes(` ${words}`)) score = 60;
        else if (entry.title.includes(words)) score = 45;
        else if (entry.director === words) score = 50;
        else if (` ${entry.director}`.includes(` ${words}`)) score = 38;
        else {
          // Every word of the query somewhere in the title or the director's name.
          const parts = words.split(' ');
          if (parts.length > 1 && parts.every(part => entry.title.includes(part) || entry.director.includes(part))) score = 30;
        }
        if (!score) continue;
        if (year) score += entry.year === year ? 15 : -10;
      } else if (year) {
        if (entry.year !== year) continue;
        score = 20;
      }
      // Between equal matches, the better-known film first.
      score += (universe.films[entry.i].rn ?? 0) * 1.5;
      found.push({ star: entry.i, score });
    }
    found.sort((a, b) => b.score - a.score || a.star - b.star);
    return found.slice(0, limit);
  }

  /** An exact title (and year, if given): the star's index, or -1. */
  function exact(title, year) {
    refresh();
    const q = fold(title);
    if (!q) return -1; // a title with nothing to compare (another script) is only ever matched by its slug
    const bare = q.replace(ARTICLE, '');
    let best = -1;
    for (const entry of entries) {
      if (entry.title !== q && entry.bare !== bare) continue;
      if (year && entry.year && Math.abs(Number(entry.year) - Number(year)) > 1) continue;
      if (best < 0 || (universe.films[entry.i].rn ?? 0) > (universe.films[best].rn ?? 0)) best = entry.i;
    }
    return best;
  }

  /** Traits whose words match: [{ trait, df }], commonest first. */
  function traits(query, limit = 5) {
    const q = fold(query);
    if (q.length < 3) return [];
    const found = [];
    universe.traits.forEach((trait, id) => {
      if (trait.v || trait.df < 4) return;
      const label = fold(trait.t);
      const short = fold(trait.s);
      if (label === q || short === q) found.push({ trait: id, df: trait.df, score: 3 });
      else if (` ${label}`.includes(` ${q}`) || ` ${short}`.includes(` ${q}`)) found.push({ trait: id, df: trait.df, score: 2 });
    });
    found.sort((a, b) => b.score - a.score || b.df - a.df);
    return found.slice(0, limit);
  }

  return { films, exact, traits };
}
