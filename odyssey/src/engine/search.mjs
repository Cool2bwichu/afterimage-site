// Finding a star by name. Titles, directors and years are matched without
// regard to accents or case; a query can also name a trait ("robbery", "dread").

export function fold(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const ARTICLE = /^(the|a|an|le|la|les|il|lo|el|los|las|der|die|das|un|une) /;
const FRACTIONS = /[\u00BC-\u00BE\u2150-\u215E]/g;

/** Folded for finding: like fold, and "8½" reads as "8 1/2", a ligature as its letters. */
export function seek(text) {
  return fold(String(text || '').replace(FRACTIONS, ch => ` ${ch.normalize('NFKD')}`).normalize('NFKD'));
}

// Sequels are numbered either way: "godfather 2" is The Godfather Part II.
const ROMAN = { 2: 'ii', 3: 'iii', 4: 'iv', 5: 'v', 6: 'vi', 7: 'vii', 8: 'viii', 9: 'ix' };
const ARABIC = Object.fromEntries(Object.entries(ROMAN).map(([n, r]) => [r, n]));
const hasWord = (text, word) => ` ${text} `.includes(` ${word} `);
const hasStart = (text, word) => ` ${text}`.includes(` ${word}`);

/** Whether two words are one slip of the keyboard apart (two, for long words): a letter wrong, missing, extra or swapped. */
function near(word, typed) {
  const limit = typed.length >= 8 ? 2 : 1;
  const close = (a, b) => {
    if (Math.abs(a.length - b.length) > limit) return false;
    let previous = Array.from({ length: b.length + 1 }, (_, n) => n);
    let before = null;
    for (let i = 1; i <= a.length; i += 1) {
      const row = [i];
      let best = i;
      for (let j = 1; j <= b.length; j += 1) {
        let cost = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (before && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cost = Math.min(cost, before[j - 2] + 1);
        row.push(cost);
        best = Math.min(best, cost);
      }
      if (best > limit) return false;
      before = previous;
      previous = row;
    }
    return previous[b.length] <= limit;
  };
  // A word still being typed counts too: "hitchco" is on its way to Hitchcock.
  return close(word, typed) || (word.length > typed.length && close(word.slice(0, typed.length), typed));
}

// Everyday words for kinds of film, and the chart's own word for each.
const KINDS = new Map([
  [['western', 'westerns', 'cowboy', 'cowboys'], ['the american west']],
  [['sci fi', 'scifi', 'sf'], ['science fiction']],
  [['film noir', 'neo noir', 'neonoir', 'noirs'], ['noir']],
  [['heist', 'heists', 'caper', 'capers', 'bank robbery'], ['a robbery']],
  [['gangster', 'gangsters', 'mafia', 'mob', 'mobster', 'mobsters', 'organised crime', 'organized crime'], ['crime']],
  [['vampire', 'vampires', 'zombie', 'zombies', 'werewolf', 'werewolves', 'creature feature', 'kaiju'], ['monsters']],
  [['slasher', 'slashers', 'serial killer', 'serial killers'], ['a serial killer']],
  [['road movie', 'road trip', 'roadtrip'], ['a journey by road']],
  [['courtroom', 'courtroom drama', 'legal drama'], ['a trial']],
  [['boxing', 'boxer', 'sports', 'sport'], ['sport and the ring']],
  [['kung fu', 'wuxia', 'karate'], ['martial arts']],
  [['funny', 'comedies', 'hilarious', 'laughs'], ['comic']],
  [['scary', 'frightening', 'creepy', 'spooky'], ['horror']],
  [['feel good', 'feelgood', 'heartwarming', 'uplifting', 'cosy', 'cozy', 'wholesome'], ['warm']],
  [['detective', 'whodunit', 'whodunnit', 'murder mystery'], ['mystery']],
  [['rom com', 'romcoms', 'rom coms'], ['romantic comedy']],
  [['cartoon', 'cartoons', 'animation'], ['animated']],
  [['b w', 'black white', 'monochrome'], ['black and white']],
  [['sad', 'tearjerker', 'weepie', 'weepy'], ['melancholy']],
  [['time travel', 'time loop', 'time loops'], ['time out of joint']],
  [['suspense', 'suspenseful', 'tense'], ['thriller']],
].flatMap(([words, labels]) => words.map(word => [word, labels])));
const kindOf = q => KINDS.get(q) || KINDS.get(q.replace(/ (films?|movies?|pictures?|cinema)$/, ''));

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
      const title = seek(film.t);
      entries.push({ i, title, bare: title.replace(ARTICLE, ''), director: seek(film.d), year: String(film.y || '') });
    }
    indexed = universe.count;
  };

  /** @returns {Array<{ star: number, score: number }>} best matches first */
  function films(query, limit = 8) {
    refresh();
    const q = seek(query);
    if (!q) return [];
    const yearMatch = q.match(/\b(18|19|20)\d\d\b/);
    const year = yearMatch ? yearMatch[0] : '';
    const words = q.replace(/\b(18|19|20)\d\d\b/, '').trim();
    const parts = words ? words.split(' ') : [];
    // A word of the query in the title or the director's name: from the start of a word, and a number whole, either way it is written.
    const holdsPart = (entry, part) => {
      const forms = ROMAN[part] ? [part, ROMAN[part]] : ARABIC[part] ? [part, ARABIC[part]] : null;
      if (forms || /^\d$/.test(part)) return (forms || [part]).some(form => hasWord(entry.title, form) || hasWord(entry.director, form));
      return hasStart(entry.title, part) || hasStart(entry.director, part);
    };
    const found = [];
    for (const entry of entries) {
      let score = 0;
      if (year && (entry.title === q || entry.bare === q)) score = 110; // a number in the title, not a year: Blade Runner 2049
      else if (year && (entry.title.startsWith(q) || entry.bare.startsWith(q))) score = 95;
      else if (words) {
        if (entry.title === words || entry.bare === words) score = 100;
        else if (entry.title.startsWith(words) || entry.bare.startsWith(words)) score = 80 - Math.min(20, entry.title.length - words.length) * 0.5;
        else if (` ${entry.title}`.includes(` ${words}`)) score = 60;
        else if (entry.title.includes(words)) score = 45;
        else if (entry.director === words) score = 50;
        else if (` ${entry.director}`.includes(` ${words}`)) score = 38;
        else if (parts.length > 1 && parts.every(part => holdsPart(entry, part))) score = 30;
        if (!score) continue;
        if (year) score += entry.year === year ? 15 : -10;
      } else if (year) {
        // A year alone may also be a title: 2001 is a space odyssey before it is a year.
        if (entry.title.startsWith(q) || entry.bare.startsWith(q)) score = 70;
        else if (entry.year === year) score = 20;
        else continue;
      }
      // Between equal matches, the better-known film first.
      score += (universe.films[entry.i].rn ?? 0) * 1.5;
      found.push({ star: entry.i, score });
    }
    // Nothing at all: perhaps a slip of the keyboard.
    if (!found.length && words.length >= 4) {
      for (const entry of entries) {
        const known = `${entry.title} ${entry.director}`.split(' ');
        const fits = parts.every(part => (part.length < 4 ? known.some(word => word.startsWith(part)) : known.some(word => near(word, part))));
        if (fits) found.push({ star: entry.i, score: 20 + (universe.films[entry.i].rn ?? 0) * 1.5 });
      }
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
    if (q.length < 2) return [];
    // An everyday word for a kind of film leads to the chart's own word for it.
    const kinds = kindOf(q) || [];
    if (q.length < 3 && !kinds.length) return [];
    const found = [];
    universe.traits.forEach((trait, id) => {
      if (trait.v || trait.df < 4) return;
      const label = fold(trait.t);
      const short = fold(trait.s);
      if (kinds.includes(label)) found.push({ trait: id, df: trait.df, score: 4 });
      else if (label === q || short === q) found.push({ trait: id, df: trait.df, score: 3 });
      else if (` ${label}`.includes(` ${q}`) || ` ${short}`.includes(` ${q}`)) found.push({ trait: id, df: trait.df, score: 2 });
    });
    found.sort((a, b) => b.score - a.score || b.df - a.df);
    return found.slice(0, limit);
  }

  /**
   * Whether a film answers to what was typed: every word of it a whole word of the title or of the
   * director's name, a number either way it is written ("godfather 2" is The Godfather Part II,
   * "lynch" is David Lynch's), a year only if it is the film's. "alien" does not answer to Aliens.
   */
  function answers(star, query) {
    refresh();
    const entry = entries[star];
    const parts = seek(query).split(' ').filter(Boolean);
    if (!entry || !parts.length) return false;
    const known = `${entry.title} ${entry.director}`;
    return parts.every(part => part === entry.year
      || (ROMAN[part] ? [part, ROMAN[part]] : ARABIC[part] ? [part, ARABIC[part]] : [part]).some(form => hasWord(known, form)));
  }

  return { films, exact, traits, answers };
}
