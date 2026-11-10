// Reads the ATLAS corpus and its data layers (the film-atlas repository) and
// joins them into one record per film. Nothing here reaches the network.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const read = (root, rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
const readOptional = (root, rel, fallback) => (existsSync(join(root, rel)) ? read(root, rel) : fallback);

export function slugify(text) {
  return String(text)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/½/g, ' half').replace(/&/g, ' and ').replace(/['’`]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Five renown tiers from vote counts: 4 is a landmark most people know, 0 is a deep cut. */
function renownTiers(films) {
  const votes = films.map(f => f.votes).filter(v => v > 0).sort((a, b) => a - b);
  const q = p => votes[Math.min(votes.length - 1, Math.floor(p * votes.length))];
  const cuts = [q(0.25), q(0.5), q(0.75), q(0.92)];
  for (const f of films) {
    f.renown = f.votes > 0 ? cuts.filter(c => f.votes >= c).length : 0;
  }
}

export function loadAtlas(atlasRoot) {
  const corpus = read(atlasRoot, 'atlas/static/corpus.json');
  const harvest = read(atlasRoot, 'atlas/pipeline/out/harvest.json');
  const enrich = read(atlasRoot, 'atlas/pipeline/out/enrich.json');
  const consensus = read(atlasRoot, 'atlas/pipeline/out/consensus.json');
  const fingerprints = read(atlasRoot, 'atlas/static/fingerprints.json');
  const plots = read(atlasRoot, 'atlas/pipeline/out/plots.json');
  const frames = read(atlasRoot, 'atlas/pipeline/out/frame-measures.json');
  const registers = read(atlasRoot, 'atlas/static/registers.json');
  const predicates = readOptional(atlasRoot, 'atlas/pipeline/out/predicate-tags.json', { films: {} });
  const imdbIds = readOptional(atlasRoot, 'atlas/pipeline/out/imdb-ids.json', {});
  const ratings = readOptional(atlasRoot, 'atlas/pipeline/out/rag-imdb-ratings.json', {});
  const labels = harvest.labels;

  const predicatesByFilmId = new Map(Object.values(predicates.films).map(f => [f.filmId, f]));
  const registersByFilmId = new Map();
  for (const [id, posting] of Object.entries(registers.postings)) {
    for (const filmId of posting) {
      if (!registersByFilmId.has(filmId)) registersByFilmId.set(filmId, []);
      registersByFilmId.get(filmId).push(id);
    }
  }

  const keys = Object.keys(corpus.films);
  const usedSlugs = new Map();
  const films = keys.map((key, i) => {
    const c = corpus.films[key];
    const h = harvest.films[key] || {};
    const e = enrich[key] || {};
    const con = consensus.films[key] || null;
    const fp = fingerprints.films[key];
    const plot = plots.films[key];
    const fm = frames.films[key] || null;
    const pred = predicatesByFilmId.get(c.filmId);
    let slug = `${slugify(c.title)}-${c.year}`;
    if (usedSlugs.has(slug)) slug = `${slug}-${slugify((c.director || 'film').split(' ').pop())}`;
    while (usedSlugs.has(slug)) slug += '-b';
    usedSlugs.set(slug, key);
    const rating = ratings[c.qid];
    return {
      i, key, filmId: c.filmId, slug, qid: c.qid,
      title: c.title, year: c.year, director: c.director || '',
      description: c.description || '', wikipedia: c.wikipedia || '',
      poster: c.poster || '', posterLicence: c.posterLicence || '',
      hi: c.highlight, lo: c.shadow, paletteSource: c.paletteSource,
      palette: e.palette || null,
      runtime: h.runtime || 0,
      crew: h.crew || {}, cast: h.cast || [], studio: h.studio || [],
      genre: h.genre || [], movement: h.movement || [], setting: h.setting || [],
      subject: h.subject || [], country: h.country || [], language: h.language || [],
      colour: h.colour || [], aspect: h.aspect || [], basedOn: h.basedOn || [],
      sourceAuthors: h.sourceAuthors || [], influencedBy: h.influencedBy || [],
      keywords: e.keywords || [],
      consensus: con && con.known !== 'no' ? { known: con.known, recall: con.recall || '', attrs: con.attrs || {} } : null,
      axes: fp && fp.scored && fp.axes ? fp.axes : null,
      frames: fm,
      plot: plot && plot.admitted && plot.plot ? plot.plot : null,
      predicates: pred && !pred.noneOfThese ? pred.tags || [] : [],
      registers: registersByFilmId.get(c.filmId) || [],
      imdb: (imdbIds[c.qid] || [])[0] || (rating && rating.tconst) || '',
      votes: rating ? rating.votes : 0,
    };
  });
  renownTiers(films);

  const indexByKey = new Map(films.map(f => [f.key, f.i]));
  const edges = corpus.edges
    .map(edge => ({ ...edge, ai: indexByKey.get(edge.a), bi: indexByKey.get(edge.b) }))
    .filter(edge => edge.ai !== undefined && edge.bi !== undefined && edge.ai !== edge.bi);

  return {
    films, edges, labels,
    label: qid => labels[qid] || null,
    registers: registers.definitions,
    registerPostings: registers.postings,
    consensusVocabulary: consensus.vocabulary,
    axisDefinitions: fingerprints.axes,
    versions: { corpus: corpus.meta.corpusVersion, identity: corpus.meta.identityVersion },
  };
}
