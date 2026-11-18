// The chart's own reading of a star, for when no Claude is reading it.
//
// Claude reads a star the moment it is opened, once, and the reading is kept. Until
// then, and always where no Claude is connected, the chart says what it can in its
// own words: a line on what the film is, and for each ray, what the two films share
// and where they part. Every word comes from the chart's traits and the atlas's
// readings of temper, so it is never wrong in a way the chart is not, and the same
// star always reads the same way.
import { LIGHT_IDS } from './lights.mjs';
import { hashString } from './rng.mjs';
import { reasonOf, sharedTraits } from './voyage.mjs';

const LIGHT_AT = Object.fromEntries(LIGHT_IDS.map((id, n) => [id, n]));

// ── Words. Trait labels are written to stand alone ("opens with an arrival",
// "steeped in dread"); these make them sit in a sentence.

// Feelings as adjectives, so they can follow "just as".
const FEELING = {
  fear: 'fearful', panic: 'panicked', despair: 'despairing', sadness: 'sad', shame: 'full of shame',
  tragedy: 'tragic', unhappiness: 'unhappy', humiliation: 'humiliating', 'rage and hate': 'full of rage',
  rage: 'full of rage', enchant: 'enchanting', grimdark: 'grim', informative: '', complex: '', complicated: '',
  'aching romance': 'achingly romantic', 'cerebral horror': 'chillingly cerebral', 'dream logic': 'dreamlike',
  'melancholy drift': 'wistfully adrift', 'paranoid thriller': 'paranoid', dramatic: '', powerful: '',
  'held at an ironic distance': 'held at an ironic distance', ambiguous: '', ambivalent: '', questioning: '',
};
// Story traits as noun phrases, so they can follow "another story of".
const STORY = {
  'told in episodes': 'a tale told in episodes', 'told out of order': 'a tale told out of order',
  'central intelligence agency (cia)': 'the CIA', 'usa president': 'a US president', 'native american': 'a Native American',
  'vietnam veteran': 'a Vietnam veteran', 'co-workers relationship': 'co-workers', kids: 'children', baby: 'a baby',
};
// Ways of looking, as things two films can share.
const IMAGE = {
  'raw, handheld': 'a raw, handheld camera', 'led by its music': 'music that leads', 'few words': 'few words spoken',
  'heavily stylised': 'heavy stylisation', allegorical: 'allegory', 'avant garde': 'an avant-garde form',
  'avant-garde': 'an avant-garde form', silent: 'the silent screen', animated: 'animation', techniscope: 'Techniscope',
  vistavision: 'VistaVision', 'breaking the fourth wall': 'a broken fourth wall', 'german expressionism': 'German Expressionism',
  'cinéma vérité': 'cinéma vérité',
};
// What a person did on both films, as a verb.
const MADE = { directed: 'directed', scored: 'scored', shot: 'shot', written: 'wrote', edited: 'edited', produced: 'produced', designed: 'designed' };
const THE = /^(United|Soviet|Netherlands|Czech Republic|Philippines|Dominican Republic|Central African Republic)/;

const article = word => (/^[aeiou]/i.test(word) && !/^(one|uni|use|eu)/i.test(word) ? 'an' : 'a');
const capital = text => text.charAt(0).toUpperCase() + text.slice(1);
const country = name => (THE.test(name) ? `the ${name}` : name);
function list(items) {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
/** One of a few ways of saying a thing, the same one every time for the same films. */
const pick = (options, ...keys) => options[hashString(keys.join('|')) % options.length];

/** A trait as words that sit in a sentence about its light, or '' when it says nothing there. */
export function traitWords(record) {
  const label = String(record.t || '').trim();
  const lower = label.toLowerCase();
  switch (record.k) {
    case 'opening': return `${label.replace(/^opens with\s+/i, '')} at the start`;
    case 'ending': return `${label.replace(/^a last act with\s+/i, '')} at the end`;
    case 'role': {
      if (STORY[lower] !== undefined) return STORY[lower];
      const plain = lower.replace(/\s*\(.*\)$/, '');
      return /[^s]s$/.test(plain) || /^the /.test(plain) ? plain : `${article(plain)} ${plain}`;
    }
    case 'mood': case 'attr': case 'axis': case 'register':
      if (record.l === LIGHT_AT.feeling) return FEELING[lower] ?? label;
      if (record.l === LIGHT_AT.story) return STORY[lower] ?? label;
      if (record.l === LIGHT_AT.image) return IMAGE[lower] ?? label;
      return label;
    case 'form': case 'look': return IMAGE[lower] ?? label;
    case 'movement': return `the ${record.s || label}`;
    case 'beat': case 'event': case 'predicate': return STORY[lower] ?? label;
    case 'genre': return lower === "children's" ? "children's film" : label;
    default: return label;
  }
}

// ── The people who made two films, said as people.
function madeBoth(record) {
  const label = String(record.t || '');
  let m = /^(directed|scored|shot|written|edited|produced|designed) by (.+)$/i.exec(label);
  if (m) return `${m[2]} ${MADE[m[1].toLowerCase()]} both`;
  m = /^with (.+)$/i.exec(label);
  if (m) return `${m[1]} is in both`;
  m = /^made at (.+)$/i.exec(label);
  if (m) return `both were made at ${m[1]}`;
  m = /^from the writing of (.+)$/i.exec(label);
  if (m) return `both come from the writing of ${m[1]}`;
  m = /^drawn from (.+)$/i.exec(label);
  if (m) return `both are drawn from ${m[1]}`;
  if (record.k === 'era') return `both come from ${label.replace(THE, word => `the ${word}`)}`;
  if (record.k === 'movement') return `both belong to the ${record.s || label}`;
  return '';
}
const PEOPLE = new Set(['director', 'cast', 'crew', 'author', 'source', 'studio', 'era', 'movement', 'eye', 'ear']);

// ── What two films share under one light, in a sentence.
const LEADS = {
  story: ['Another story of {}.', 'It turns on the same things: {}.', 'The same turns of story: {}.'],
  feeling: ['Just as {}.', 'It leaves the same weather: {}.', 'It feels much the same: {}.'],
  image: ['Alike to the eye and ear: {}.', 'The same look: {}.', 'It looks and sounds alike: {}.'],
  idea: ['Also about {}.', 'It circles the same things: {}.', 'About the same things: {}.'],
  world: ['The same territory: {}.', 'It lives in the same world: {}.', 'The same ground: {}.'],
};

const PLACED = /^(set in|from|spoken in) /i;
const PLACED_VERB = { 'set in': 'are set in', from: 'come from', 'spoken in': 'are spoken in' };
// How a story is told, said after what it is about: [after a list, on its own].
const MANNER = {
  'told in episodes': ['told in episodes', 'are told in episodes'],
  'told out of order': ['told out of order', 'are told out of order'],
  'told in flashback': ['told in flashback', 'are told in flashback'],
  'a tale told in episodes': ['told in episodes', 'are told in episodes'],
  'a tale told out of order': ['told out of order', 'are told out of order'],
  'a narrator': ['told by a narrator', 'are told by a narrator'],
  'a single setting': ['kept to a single place', 'keep to a single place'],
  'an ensemble': ['with an ensemble cast', 'follow an ensemble'],
};
const firstWord = text => text.split(/[\s,]+/)[0].toLowerCase();

function sameSentence(universe, light, a, b) {
  const { traits, films } = universe;
  const shared = sharedTraits(universe, light, a, b, 5).map(entry => traits[entry.trait]);
  const people = new Map(); // verb → names, so two writers are said once: "Andrew Stanton and Pete Docter wrote both"
  const words = [];
  const placed = [];
  const manner = [];
  for (const record of shared) {
    if (PEOPLE.has(record.k)) {
      const said = madeBoth(record);
      if (!said || people.size >= 2 && ![...people.keys()].some(verb => said.endsWith(verb))) continue;
      const m = /^(.+?) (directed both|scored both|shot both|wrote both|edited both|produced both|designed both|is in both)$/.exec(said);
      const verb = m ? m[2] : said;
      if (!people.has(verb)) people.set(verb, []);
      if (m) people.get(verb).push(m[1]);
      continue;
    }
    const said = traitWords(record);
    if (!said || words.includes(said) || words.some(word => firstWord(word) === firstWord(said))) continue;
    if (light === 'world' && PLACED.test(said)) { if (placed.length < 2) placed.push(said); continue; }
    if (light === 'story' && MANNER[said]) { if (!manner.length) manner.push(MANNER[said]); continue; }
    if (words.length < 3) words.push(said);
  }
  const madeBy = [...people].map(([verb, names]) => {
    if (!names.length) return verb;
    return names.length > 1 && verb === 'is in both' ? `${list(names)} are in both` : `${list(names)} ${verb}`;
  });
  const key = [films[a].s, films[b].s, light];
  const parts = [];
  if (light === 'hands' || (madeBy.length && !words.length && !placed.length)) {
    if (madeBy.length) parts.push(`${capital(madeBy.join(', and '))}.`);
    else if (words.length) parts.push(`${capital(list(words))}.`);
  } else if (words.length) {
    let body = list(words);
    // Where both are set is worth saying beside what they share; that both are American is not.
    const set = placed.filter(place => /^set in /i.test(place));
    if (set.length) body += `, ${set.join(', ')}`;
    if (manner.length) body += `, ${manner[0][0]}`;
    parts.push(pick(LEADS[light] || LEADS.world, ...key).replace('{}', body));
    if (madeBy.length) parts.push(`${capital(madeBy[0])}.`);
  } else if (placed.length) {
    parts.push(`Both ${placed.map(place => place.replace(PLACED, (_, how) => `${PLACED_VERB[how.toLowerCase()]} `)).join(', and ')}.`);
  } else if (manner.length) {
    parts.push(`Both ${manner[0][1]}.`);
  }
  return parts.join(' ');
}

// ── Where two films part.
const BENDS = [
  { more: 'more frightening', less: 'calmer' },
  { more: 'harsher', less: 'gentler' },
  { more: 'more ironic', less: 'more sincere' },
  { more: 'more open-ended', less: 'more resolved' },
  { more: 'more broken up in its telling', less: 'told more simply' },
];
function partSentence(universe, a, b) {
  const A = universe.films[a];
  const B = universe.films[b];
  const is = [];
  const other = [];
  if (Array.isArray(A.ax) && Array.isArray(B.ax)) {
    const bends = BENDS.map((words, n) => ({ words, change: A.ax[n] >= 0 && B.ax[n] >= 0 ? B.ax[n] - A.ax[n] : 0 }))
      .filter(bend => Math.abs(bend.change) >= 28)
      .sort((x, y) => Math.abs(y.change) - Math.abs(x.change));
    for (const bend of bends.slice(0, 2)) is.push(bend.change > 0 ? bend.words.more : bend.words.less);
  }
  const gap = (B.y || 0) - (A.y || 0);
  if (A.y && B.y && Math.abs(gap) >= 12) other.push(`was made ${Math.abs(gap)} years ${gap < 0 ? 'earlier' : 'later'}`);
  const theirs = Array.isArray(B.c) ? B.c.slice(0, 2) : [];
  const ours = Array.isArray(A.c) ? A.c : [];
  if (theirs.length && ours.length && !theirs.some(name => ours.includes(name))) other.push(`comes from ${list(theirs.map(country))}`);
  if (A.rt > 0 && B.rt > 0 && Math.abs(B.rt - A.rt) >= 45) other.push(`runs ${Math.abs(B.rt - A.rt)} minutes ${B.rt < A.rt ? 'shorter' : 'longer'}`);
  const said = [];
  if (is.length) said.push(`is ${list(is)}`);
  said.push(...other.slice(0, is.length ? 1 : 2));
  if (!said.length) return '';
  const name = B.t.length > 30 ? 'It' : B.t;
  return `${name} ${said.length > 1 ? `${said.slice(0, -1).join(', ')}, and ${said[said.length - 1]}` : said[0]}.`;
}

/** What two films share under one light, in a sentence of the chart's words, or ''. */
export function plainBond(universe, light, a, b) {
  return sameSentence(universe, light, a, b);
}

/**
 * Why a ray leads from one film to another, in the chart's words: what they share
 * under its light, and where they part.
 */
export function plainClaim(universe, light, a, b) {
  return [sameSentence(universe, light, a, b), partSentence(universe, a, b)].filter(Boolean).join(' ');
}

// What people remember of a film can give its end away. Anything that sounds like it does is not said.
const TELLS = /(\b[A-Z][a-z]+ (is )?shot\b(?! by| on (film|location|video)))|\b(dies|died|dying|death|dead|deaths|drowns?|drowned|kill(s|ed|ing)?|murder(s|ed)?|suicide|shoots?|shot (dead|down)|last shot|final|finale|ending|ends|end of|reveal(s|ed)?|twist|turns out|really is|was really|betray(s|ed)|execut(ed|ion)|corpse|body of|funeral|grave)\b/i;
/** Whether a remembered moment may be said without spoiling the film. */
export const safeToTell = text => Boolean(text) && !TELLS.test(text);

/** What to watch for in a film: the first thing people remember of it, where the atlas knows and it gives nothing away. */
export function plainWatch(universe, b) {
  const memory = String(universe.films[b]?.rc || '').split(';')[0].trim().replace(/[.\s]+$/, '');
  return safeToTell(memory) ? memory : '';
}

// ── A line on what a star is.
const TEMPER_WORDS = [
  { high: 'dread-filled', low: '' },
  { high: 'merciless', low: 'tender' },
  { high: 'ironic', low: '' },
];
// How much each kind of trait may speak for a film in a single line. Rare traits say most
// about a film but are often a classifier's whim, and the commonest say little: both count less.
const SPEAKS = { predicate: 1, event: 1, attr: 0.9, register: 0.8, beat: 0.55, theme: 0.8, relation: 0.85, genre: 1, tradition: 0.9, place: 1, period: 0.9 };
function strongest(universe, star, light, kinds, limit) {
  const { traits, model } = universe;
  const many = universe.base || universe.count;
  return model.index[light].traits(star, 60)
    .map(entry => {
      const record = traits[entry.trait];
      const df = record.df || 0;
      const reach = df < 6 ? 0.45 : df < 12 ? 0.8 : df > many * 0.22 ? 0.7 : 1;
      return { record, raw: entry.raw, score: entry.raw * (SPEAKS[record.k] ?? 0.5) * reach + entry.weight };
    })
    .filter(entry => !entry.record.v && kinds.includes(entry.record.k))
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}

// The kind of film, as its encyclopedia entry says it: "Heat is a 1995 American epic crime film" gives "epic crime film".
const KEEP_CAPITAL = new Set(['Western', 'Westerns', 'Gothic', 'Christmas', 'Southern', 'Bollywood', 'Expressionist']);
const STANDS = /(drama|comedy|comedies|thriller|western|musical|documentary|melodrama|romance|satire|tragedy|epic|mystery|procedural|opera|jidaigeki|noir|anthology|tragicomedy|biopic|swashbuckler|mockumentary|fantasy|adventure|parody|giallo|farce|fable|odyssey|chanbara|wuxia|horror|animation|anime|short)$/i;
export function kindOfFilm(film) {
  const first = String(film.x || '').split(/(?<=[a-z0-9)])\.\s/)[0];
  const m = /\bis an? (?:\d{4} )?(.+?) (film|movie|picture|feature)\b/.exec(first);
  if (!m) return '';
  const words = m[1].replace(/\([^)]*\)/g, ' ').split(/\s+/).filter(Boolean);
  while (words.length && /^[A-Z]/.test(words[0]) && !KEEP_CAPITAL.has(words[0])) words.shift();
  while (words.length && /^(and|-|–)$/i.test(words[0])) words.shift();
  const kind = words.join(' ').replace(/^(independent|feature-length|feature) /i, '');
  if (!kind || kind.length > 48 || /\d/.test(kind) || !/[a-z]/.test(kind) || /^(period|silent|black-and-white|short|independent|low-budget)$/i.test(kind)) return '';
  return STANDS.test(kind) ? kind : `${kind} film`;
}

/** A star in a sentence, in the chart's words: "A merciless epic crime film set in Los Angeles, about obsession: a robbery and a double cross." */
export function plainHook(universe, star) {
  const film = universe.films[star];
  if (!film || star >= universe.count) return '';
  const feel = [];
  if (Array.isArray(film.ax)) {
    TEMPER_WORDS.forEach((words, n) => {
      const value = film.ax[n];
      if (value >= 62 && words.high) feel.push({ word: words.high, strength: value - 50 });
      else if (value >= 0 && value <= 12 && words.low) feel.push({ word: words.low, strength: 50 - value });
    });
  }
  for (const { record } of strongest(universe, star, 'feeling', ['attr', 'register'], 3)) {
    const word = traitWords(record);
    // Only words that sit before a noun: "slow-burning", "achingly romantic".
    if (word && (!word.includes(' ') || /^\w+ly \w+$/.test(word))) feel.push({ word, strength: 20 });
  }
  const genre = strongest(universe, star, 'world', ['genre', 'tradition'], 1)[0];
  const noun = kindOfFilm(film) || (genre ? `${traitWords(genre.record).replace(/^(an?|the) /i, '')}${STANDS.test(traitWords(genre.record)) ? '' : ' film'}` : 'film');
  // Never "a comic comedy" or "a romantic romance".
  const echoes = word => noun.toLowerCase().split(/[\s-]+/).some(part => {
    let n = 0;
    while (n < Math.min(part.length, word.length) && part[n] === word[n]) n += 1;
    return n >= 3 && n >= 0.6 * Math.min(part.length, word.length);
  });
  const adjectives = [];
  for (const { word } of feel.sort((x, y) => y.strength - x.strength)) {
    if (adjectives.length < 2 && !echoes(word) && !adjectives.some(taken => firstWord(taken) === firstWord(word))) adjectives.push(word);
  }
  // A place is said only when one stands clearly first: The Godfather is as much New York as Los Angeles to the chart.
  const places = strongest(universe, star, 'world', ['place', 'period'], 2);
  const where = places.length && (places.length < 2 || places[0].raw > places[1].raw) ? places[0].record : null;
  const about = strongest(universe, star, 'idea', ['attr', 'theme', 'register', 'relation'], 1)[0];
  const turns = strongest(universe, star, 'story', ['register', 'predicate', 'event', 'attr', 'beat'], 4)
    .map(({ record }) => traitWords(record)).filter(word => word && !MANNER[word] && /^(an? |the |someone |something )/.test(word)).slice(0, 2);

  const lead = adjectives.length ? `${adjectives.join(', ')} ${noun}` : noun;
  let line = `${capital(article(lead))} ${lead}`;
  if (where) line += where.k === 'place' ? ` ${traitWords(where)}` : ` set in ${traitWords(where)}`;
  if (about) line += `, about ${traitWords(about.record)}`;
  if (turns.length) line += `: ${list(turns)}`;
  return `${line}.`;
}

/** The chart's whole reading of a star, shaped like Claude's, and marked as the chart's. */
export function plainArrival(universe, star, rays) {
  return {
    plain: true,
    essence: plainHook(universe, star),
    beyond: null,
    rays: rays.map(ray => ({ light: ray.light, star: ray.star, claim: plainClaim(universe, ray.light, star, ray.star), watch: plainWatch(universe, ray.star) })),
  };
}
