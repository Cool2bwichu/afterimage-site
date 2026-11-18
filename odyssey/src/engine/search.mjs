// Finding a star by name. Titles, directors and years are matched without
// regard to accents or case; a query can also name a trait ("robbery", "dread").

import { LIGHT_IDS } from './lights.mjs';

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
  // Moods, the way people ask for a film tonight.
  [['romantic', 'romance', 'love story', 'love stories', 'date night'], ['a love affair']],
  [['trippy', 'surreal', 'dreamy', 'strange', 'weird'], ['dreamlike']],
  [['thought provoking', 'smart', 'clever', 'intelligent', 'mind bending', 'mindbending', 'philosophical'], ['cerebral']],
  [['slow', 'quiet', 'meditative', 'calm', 'peaceful', 'still'], ['contemplative']],
  [['gentle', 'kind', 'sweet', 'tender'], ['tender']],
  [['fast', 'fast paced', 'adrenaline', 'exciting', 'thrilling', 'action packed', 'intense'], ['relentless']],
  [['dark', 'grim', 'gritty', 'depressing', 'bleak'], ['bleak']],
  [['happy', 'fun', 'light', 'lighthearted', 'light hearted', 'joyful', 'charming'], ['warm']],
  [['sexy', 'erotic', 'steamy', 'sensual'], ['sensual']],
  [['beautiful', 'gorgeous', 'stunning', 'visually stunning', 'beautifully shot'], ['painterly frames']],
  [['hopeful', 'inspiring', 'inspirational', 'optimistic'], ['hopeful']],
  [['moving', 'emotional', 'heartbreaking', 'tearjerking', 'make me cry', 'cry'], ['melancholy']],
  [['unsettling', 'disturbing', 'menacing', 'sinister'], ['menacing']],
  [['family film', 'family films', 'family movie', 'kids', 'for kids', 'family friendly', 'childrens', 'children'], ['children’s', 'children\'s']],
  [['family', 'families', 'family drama'], ['family', 'family as a trap', 'parents and children']],
  [['twist', 'twists', 'twisty', 'plot twist', 'puzzle', 'twist ending', 'surprise ending', 'shock ending'], ['a twist']],
  [['open ending', 'ambiguous ending', 'open ended', 'ambiguous'], ['an ending left open']],
  [['absurd', 'silly', 'deadpan', 'quirky'], ['absurd']],
  [['war', 'war film', 'war films', 'war movie'], ['soldiers and war']],
  [['ghost', 'ghost story', 'ghost stories', 'haunted'], ['ghosts']],
  [['epic', 'epics', 'sweeping'], ['epic']],
  [['documentaries', 'docs', 'doc'], ['documentary']],
  [['coming of age', 'teen', 'teens', 'teenage', 'growing up'], ['coming-of-age']],
  [['friendship', 'buddy', 'buddies', 'friends'], ['friendship']],
  // What happens in a film, the way people tell it: "a heist goes wrong and the thief falls in love".
  [['falls in love', 'fall in love', 'falling in love', 'fell in love', 'in love', 'love', 'romance blossoms'], ['a love affair', 'a forbidden love', 'a love triangle', 'aching romance', 'an affair']],
  [['goes wrong', 'go wrong', 'gone wrong', 'went wrong', 'going wrong', 'falls apart', 'fall apart', 'backfires', 'unravels', 'doomed', 'spirals', 'spiral', 'spirals out of control', 'out of control'], ['noir fatalism', 'a double cross', 'a betrayal', 'things get steadily worse', 'a downfall']],
  [['thief', 'thieves', 'robber', 'robbers', 'burglar', 'burglars', 'burglary', 'crook', 'crooks', 'robbery', 'robberies', 'stolen', 'steal', 'steals', 'stealing'], ['a robbery']],
  [['cop', 'cops', 'police', 'policeman', 'policemen', 'detectives'], ['cops and crime', 'an investigation']],
  [['hitman', 'hit man', 'hitmen', 'assassin', 'assassins', 'contract killer'], ['a hired killer']],
  [['kidnap', 'kidnaps', 'kidnapped', 'abduction', 'abducted', 'ransom'], ['a kidnapping']],
  [['revenge', 'vengeance', 'avenge', 'avenges', 'avenging', 'get even', 'payback', 'revenge story'], ['revenge']],
  [['on the run', 'fugitive', 'fugitives', 'runs away', 'run away', 'running away', 'escape', 'escapes', 'escaped', 'flees', 'manhunt'], ['someone on the run']],
  [['chase', 'chases', 'chased', 'pursued', 'hunted', 'cat and mouse'], ['a pursuit']],
  [['conspiracy', 'conspiracies', 'cover up', 'coverup'], ['a conspiracy']],
  [['spy', 'spies', 'espionage', 'secret agent', 'cold war'], ['a conspiracy', 'paranoid thriller']],
  [['affair', 'cheating', 'cheats', 'adultery', 'infidelity', 'unfaithful', 'mistress', 'lover'], ['an affair']],
  [['love triangle'], ['a love triangle']],
  [['forbidden love', 'forbidden romance', 'star crossed', 'star crossed lovers'], ['a forbidden love']],
  [['divorce', 'breakup', 'break up', 'separation', 'marriage falling apart', 'failing marriage'], ['a marriage coming apart', 'marriage in decay']],
  [['wife', 'husband', 'married', 'married couple', 'marriage'], ['marriage']],
  [['mother', 'father', 'mom', 'mum', 'dad', 'parents', 'parent', 'son', 'daughter', 'sons', 'daughters'], ['parents and children']],
  [['brother', 'sister', 'brothers', 'sisters', 'siblings', 'sibling'], ['brothers and sisters']],
  [['grief', 'grieving', 'grieves', 'mourning', 'mourns', 'loss', 'bereavement', 'death of'], ['grief', 'a mourning']],
  [['lonely', 'loneliness', 'alone', 'isolated', 'isolation', 'solitude', 'loner'], ['loneliness']],
  [['amnesia', 'memories', 'remembering', 'forgetting', 'memory loss', 'nostalgia', 'nostalgic'], ['memory']],
  [['obsessed', 'obsessive', 'obsession', 'fixation'], ['obsession']],
  [['madness', 'insane', 'insanity', 'goes mad', 'going mad', 'goes crazy', 'paranoia', 'psychological', 'mental illness', 'losing his mind', 'losing her mind', 'nervous breakdown'], ['a mind coming apart', 'a breakdown']],
  [['aliens', 'alien', 'extraterrestrial', 'extraterrestrials', 'ufo', 'first contact', 'invasion'], ['visitors from elsewhere']],
  [['robot', 'robots', 'android', 'androids', 'artificial intelligence', 'ai', 'cyborg'], ['thinking machines', 'artificial life']],
  [['outer space', 'spaceship', 'astronaut', 'astronauts', 'space travel', 'in space'], ['space']],
  [['future', 'futuristic', 'dystopia', 'dystopian'], ['the future', 'a ruined future']],
  [['apocalypse', 'apocalyptic', 'post apocalyptic', 'end of the world', 'wasteland'], ['after the end', 'a ruined future']],
  [['dream', 'dreams', 'nightmare', 'nightmares', 'visions', 'hallucination', 'hallucinations'], ['dreams and visions']],
  [['prison', 'jail', 'prisoner', 'prisoners', 'inmate', 'inmates', 'convict', 'convicts'], ['prison']],
  [['sea', 'ocean', 'ship', 'boat', 'sailor', 'sailors', 'at sea', 'island'], ['the sea']],
  [['city at night', 'at night', 'nighttime', 'neon', 'night city', 'nocturnal'], ['a city at night']],
  [['small town', 'small towns', 'town'], ['a small town']],
  [['village', 'countryside', 'rural', 'farm', 'farmer', 'farmers', 'peasants'], ['village and country']],
  [['wilderness', 'woods', 'forest', 'mountains', 'mountain', 'jungle', 'nature'], ['wilderness']],
  [['lawyer', 'lawyers', 'court', 'jury', 'courtroom'], ['a trial']],
  [['journalist', 'reporter', 'journalists', 'investigates', 'investigating', 'investigation', 'mystery to solve'], ['an investigation']],
  [['artist', 'painter', 'writer', 'novelist', 'poet', 'sculptor'], ['artists at work']],
  [['addict', 'addicts', 'drugs', 'heroin', 'alcoholic', 'alcoholism', 'drinking', 'drunk'], ['addiction']],
  [['poor', 'poverty', 'broke', 'homeless'], ['poverty', 'money trouble']],
  [['rich', 'wealthy', 'upper class', 'working class', 'class struggle'], ['class']],
  [['gay', 'lesbian', 'queer', 'lgbt', 'lgbtq', 'trans'], ['queer lives']],
  [['racism', 'race', 'segregation'], ['race and racism']],
  [['god', 'religion', 'religious', 'priest', 'priests', 'nun', 'nuns', 'church', 'faith'], ['faith and the spirit', 'faith and its silence']],
  [['politics', 'political', 'revolution', 'regime', 'dictator', 'dictatorship'], ['politics and power']],
  [['sick', 'illness', 'cancer', 'disease'], ['an illness', 'mortality']],
  [['death', 'dies', 'died', 'dying', 'a death'], ['a mourning', 'grief', 'mortality']],
  [['pregnant', 'pregnancy', 'baby on the way'], ['a pregnancy']],
  [['betrayed', 'betrays', 'betrayal', 'double crossed', 'double crosses', 'double cross', 'backstab', 'backstabbing'], ['a betrayal', 'a double cross']],
  [['lies', 'lying', 'liar', 'liars', 'con man', 'con artist', 'swindle', 'swindler', 'scam', 'grift', 'grifter', 'imposter', 'impostor', 'disguise'], ['a deception', 'a false identity']],
  [['secret', 'secrets', 'hidden past', 'dark secret'], ['a secret']],
  [['narrator', 'narrated', 'voiceover', 'voice over', 'unreliable narrator'], ['a narrator']],
  [['nonlinear', 'non linear', 'out of order', 'told backwards', 'backwards', 'flashbacks'], ['told out of order', 'a fractured telling']],
  [['one location', 'one room', 'single location', 'one house', 'bottle'], ['a single setting']],
  [['race against time', 'countdown', 'ticking clock', 'deadline'], ['a race against time']],
  [['survive', 'survival', 'stranded', 'survivor', 'survivors', 'shipwreck'], ['survival']],
  [['murder', 'murders', 'murdered', 'killer', 'killing', 'killings'], ['a murder']],
  [['musician', 'band', 'singer', 'songs', 'music'], ['led by its music', 'a performance']],
  [['stranger', 'outsider', 'newcomer', 'foreigner', 'immigrant', 'immigrants', 'fish out of water'], ['a stranger in a strange place']],
  [['comes home', 'returns home', 'goes home', 'going home', 'return home', 'homecoming'], ['a homecoming']],
  [['trip', 'travels', 'travel', 'voyage', 'quest'], ['a journey']],
  [['job', 'office', 'workplace', 'career', 'working'], ['work']],
  [['money', 'debt', 'debts', 'gambling', 'gambler'], ['money trouble']],
  [['wedding', 'party', 'parties', 'festival', 'feast'], ['a celebration']],
  [['confesses', 'confession', 'confess'], ['a confession']],
  [['contest', 'competition', 'tournament', 'game'], ['a contest']],
  [['power struggle', 'rise to power', 'rises to power', 'ambition'], ['a rise to power']],
  [['heist movie', 'heist film', 'the heist', 'a heist'], ['a robbery']],
  [['professional', 'professionals', 'the job'], ['the professional job']],
  [['ensemble', 'ensemble cast', 'many characters'], ['an ensemble']],
  [['soldier', 'soldiers', 'army', 'battle', 'battlefield', 'combat', 'world war', 'ww2', 'wwii'], ['soldiers and war']],
  [['samurai', 'ronin', 'shogun'], ['samurai Japan']],
  [['cowboy', 'gunslinger', 'outlaw', 'outlaws', 'frontier'], ['the american west']],
  [['mafia boss', 'crime boss', 'underworld', 'gang', 'gangs'], ['the criminal underworld']],
  [['monster', 'creature'], ['monsters']],
  [['supernatural', 'magic', 'witch', 'witches', 'curse', 'cursed', 'demon', 'demons', 'possession'], ['the supernatural']],
].flatMap(([words, labels]) => words.map(word => [word, labels])));
// What people put around a mood when they ask for a film: "something funny", "a sad movie to watch tonight".
const FILLER_BEFORE = /^(?:(?:i want|id like|i would like|im in the mood for|in the mood for|show me|give me|find me|looking for|recommend|suggest|something|anything|some|a|an|really|very|quite|kind of|sort of|pretty|good|great|nice|really good)\s+)+/;
const FILLER_AFTER = /(?:\s+(?:films?|movies?|pictures?|cinema|flicks?|to watch|for tonight|tonight|please|now|to see))+$/;
const kindOf = q => {
  const bare = q.replace(FILLER_BEFORE, '').replace(FILLER_AFTER, '').trim();
  return KINDS.get(q) || KINDS.get(q.replace(/ (films?|movies?|pictures?|cinema)$/, '')) || (bare && bare !== q ? KINDS.get(bare) : undefined);
};

// ── Describing a film: "a heist goes terribly wrong and the thief falls in love".
// Words that carry nothing about a film on their own.
const STOP = new Set(`a an the and or but nor of in on at to for with without from by into onto about over under after before
  during as is are was were be been being it its this that these those there their they them he she his her him hers who whom
  whose which what where when while than then so such very really quite just only also too more most less some any all each both
  one two three film films movie movies picture pictures cinema story stories something someone somebody anything anyone thing things
  kind sort like where whos thats theres goes go going gets get got has have had happens happen happening does do did doing can could
  would should will make makes made set feel feels vibe vibes watch watching tonight want wants wanted looking look i im me my id ive
  we our you your man men woman women guy guys girl girls boy boys people person life lives world way time times day days year years
  new old young big little first last other another same own through up down out off again ends end begins starts until finally
  eventually suddenly halfway midway later soon then terribly badly horribly totally completely utterly slowly gradually somehow
  actually literally kinda basically pretty fairly rather plot whose follows following follow tells telling told around way ways back`
  .split(/\s+/).filter(Boolean));
const TENS = { twenties: 1920, thirties: 1930, forties: 1940, fifties: 1950, sixties: 1960, seventies: 1970, eighties: 1980, nineties: 1990 };
/** A decade however it is written: "70s", "1970s", "seventies" all read "1970s". */
const decade = word => {
  if (TENS[word]) return `${TENS[word]}s`;
  const short = word.match(/^(\d)0s$/);
  if (short) return `${Number(short[1]) >= 2 ? 19 : 20}${short[1]}0s`;
  return word;
};
/** One form for a word and its plurals and tenses, near enough: "thieves", "robbing" and "robbed" meet their roots. */
export function stem(word) {
  if (word.length <= 4) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('ves')) return word.slice(0, -3) + 'f';
  if (/(?:ss|x|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')) return word.slice(0, -1);
  if (word.endsWith('ing') && word.length >= 7) return word.slice(0, -3);
  if (word.endsWith('ed') && word.length >= 6) return word.slice(0, -2);
  return word;
}
const stemAll = text => text.split(' ').filter(Boolean).map(stem).join(' ');
// Words that only lean on the words beside them ("goes terribly wrong"), dropped before reading.
const SOFT = new Set('terribly badly horribly totally completely utterly slowly gradually somehow actually literally kinda basically really very quite pretty fairly rather suddenly eventually finally halfway midway later soon then just'.split(' '));
// Traits named after people or companies: matched only by their whole name.
const NAMED = new Set(['cast', 'crew', 'director', 'eye', 'ear', 'author', 'studio', 'source']);
// Traits a single word should not find inside a longer label: "drives" is not "contempt drives a person to…".
const LOOSE = new Set(['era', 'predicate', 'opening', 'ending', 'arc']);

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
    const kinds = (kindOf(q) || []).map(fold);
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

  // ── A description, read into parts the chart knows, and the films that carry the most of them.
  let phrases = null; // stemmed label or short → trait ids
  let wording = null; // stemmed word → films whose own words hold it
  let worded = 0;
  function phraseIndex() {
    if (phrases && phrases.size && phrases.traits === universe.traits.length) return phrases;
    phrases = new Map();
    phrases.traits = universe.traits.length;
    const add = (key, id) => { if (!key) return; if (!phrases.has(key)) phrases.set(key, new Set()); phrases.get(key).add(id); };
    universe.traits.forEach((trait, id) => {
      if (trait.v || (trait.df ?? 0) < 4) return;
      const label = fold(trait.t);
      const short = fold(trait.s);
      add(stemAll(label), id);
      add(stemAll(label.replace(ARTICLE, '')), id);
      if (short) { add(stemAll(short), id); add(stemAll(short.replace(ARTICLE, '')), id); }
    });
    return phrases;
  }
  function wordIndex() {
    if (wording && worded === universe.count) return wording;
    wording ||= new Map();
    for (let i = worded; i < universe.count; i += 1) {
      const film = universe.films[i];
      const said = new Set(fold(`${film.x || ''} ${film.rc || ''}`).split(' ').filter(word => word.length >= 3 && !STOP.has(word)).map(stem));
      for (const word of said) { if (!wording.has(word)) wording.set(word, []); wording.get(word).push(i); }
    }
    worded = universe.count;
    return wording;
  }
  const lightOf = id => LIGHT_IDS[universe.traits[id].l];
  const strongest = ids => [...ids].sort((a, b) => (universe.traits[a].v ? 1 : 0) - (universe.traits[b].v ? 1 : 0) || (universe.traits[b].df || 0) - (universe.traits[a].df || 0));

  /** The traits a few words name: an everyday phrase, a label or short name, or (one word) a label holding it whole. */
  function namedBy(words) {
    const phrase = words.join(' ');
    const kinds = KINDS.get(phrase);
    if (kinds) {
      // A phrase may name a turn the chart keeps veiled ("goes wrong"): it is matched, never named.
      const wanted = new Set(kinds.map(fold));
      const ids = [];
      universe.traits.forEach((trait, id) => { if ((trait.df ?? 0) >= 4 && wanted.has(fold(trait.t))) ids.push(id); });
      if (ids.some(id => !universe.traits[id].v)) return strongest(ids);
    }
    if (STOP.has(words[0]) || STOP.has(words[words.length - 1])) return [];
    const found = phraseIndex().get(stemAll(phrase));
    if (found) {
      const ids = [...found].filter(id => words.length > 1 || !NAMED.has(universe.traits[id].k));
      if (ids.length) return strongest(ids).slice(0, 6);
    }
    if (words.length === 1 && phrase.length >= 4) {
      const root = stem(phrase);
      const ids = [];
      universe.traits.forEach((trait, id) => {
        if (trait.v || (trait.df ?? 0) < 4 || NAMED.has(trait.k) || LOOSE.has(trait.k)) return;
        if (` ${stemAll(fold(trait.t))} `.includes(` ${root} `)) ids.push(id);
      });
      return strongest(ids).slice(0, 4);
    }
    return [];
  }

  /**
   * Reads a description ("a heist goes terribly wrong and the thief falls in love") into the parts the
   * chart can see (a robbery; things going wrong; a love affair) and finds the films that carry the most
   * of them, the most strongly. A word no trait answers to is looked for in the films' own words.
   * @returns {{ parts: Array<{ words: string, label: string, light: string, traits: number[], word?: string }>, missed: string[],
   *   films: Array<{ star: number, degree: number, matched: number[] }> }}
   */
  function describe(query, { limit = 120 } = {}) {
    const empty = { parts: [], missed: [], films: [] };
    let q = fold(query).replace(FILLER_BEFORE, '').replace(FILLER_AFTER, '').trim();
    const tokens = q.split(' ').filter(word => word && !SOFT.has(word)).map(decade);
    if (!tokens.length) return empty;
    const parts = [];
    const missed = [];
    const words = wordIndex();
    const common = Math.max(12, Math.round(universe.count * 0.06));
    for (let i = 0; i < tokens.length;) {
      let taken = 0;
      for (let n = Math.min(5, tokens.length - i); n >= 1 && !taken; n -= 1) {
        const window = tokens.slice(i, i + n);
        const ids = namedBy(window);
        if (!ids.length) continue;
        taken = n;
        const said = window.join(' ');
        const same = parts.find(part => part.traits && part.traits.length === ids.length && part.traits.every(id => ids.includes(id)));
        if (same) { same.words += `, ${said}`; continue; }
        parts.push({ words: said, label: universe.traits[ids[0]].t, light: lightOf(ids[0]), traits: ids });
      }
      if (taken) { i += taken; continue; }
      const word = tokens[i];
      i += 1;
      if (STOP.has(word) || word.length < 3 || /^\d+$/.test(word)) continue;
      const holders = words.get(stem(word));
      if (!holders || !holders.length) { missed.push(word); continue; }
      if (holders.length > common) continue; // too common to tell films apart
      if (parts.some(part => part.word === stem(word))) continue;
      parts.push({ words: word, label: `“${word}”`, light: 'white', traits: [], word: stem(word) });
    }
    if (!parts.length) return { ...empty, missed };

    // How strongly each film carries each part: the trait as the chart recorded it, or its own words.
    const n = parts.length;
    const strength = new Map(); // star → Float32Array(n)
    const at = star => { if (!strength.has(star)) strength.set(star, new Float32Array(n)); return strength.get(star); };
    parts.forEach((part, p) => {
      if (part.word) { for (const star of words.get(part.word) || []) { const row = at(star); row[p] = Math.max(row[p], 0.55); } return; }
      for (const id of part.traits) {
        universe.model.index[lightOf(id)].eachCarrier(id, (star, raw) => {
          const row = at(star);
          row[p] = Math.max(row[p], 0.4 + 0.6 * (raw / 255));
        });
      }
    });
    const scored = [];
    for (const [star, row] of strength) {
      const matched = [];
      let sum = 0;
      row.forEach((value, p) => { if (value > 0) { matched.push(p); sum += value; } });
      const cover = matched.length / n;
      const degree = cover ** 1.5 * (0.6 + 0.4 * (sum / matched.length)) + 0.012 * (universe.films[star].rn ?? 0);
      scored.push({ star, degree, matched });
    }
    // The films that carry at least half of it (all of a short one); fewer only if hardly any do.
    const need = n <= 2 ? n : Math.ceil(n / 2);
    let kept = scored.filter(entry => entry.matched.length >= need);
    if (kept.length < 6) kept = scored.filter(entry => entry.matched.length >= Math.max(1, need - 1));
    kept.sort((a, b) => b.degree - a.degree || a.star - b.star);
    kept = kept.slice(0, limit);
    const top = kept.length ? kept[0].degree : 1;
    for (const entry of kept) entry.degree = Math.min(1, entry.degree / top);
    return { parts, missed, films: kept };
  }

  return { films, exact, traits, answers, describe };
}
