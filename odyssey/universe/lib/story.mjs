// Story shape from a plot summary: a fortune curve read from the valence of
// its wording, the nearest of six classic arcs, and the beats found in each
// third. A rough instrument, and it is labelled as one wherever it is shown.
import { afinn165 } from 'afinn-165';
import { BEATS, ARCS } from '../authored/beats.mjs';

// Plot summaries narrate events flatly, so a few plot verbs carry more weight
// than general-purpose sentiment gives them.
const PLOT_VALENCE = {
  kills: -4, killed: -4, murders: -4, murdered: -4, dies: -4, died: -4, dead: -3, death: -3,
  suicide: -4, drowns: -4, executed: -4, raped: -5, rapes: -5, tortured: -4, arrested: -3,
  imprisoned: -3, captured: -2, kidnapped: -3, abducted: -3, betrays: -3, betrayed: -3,
  abandons: -2, abandoned: -2, attacks: -2, attacked: -2, shoots: -3, shot: -2, stabs: -3,
  destroyed: -3, loses: -2, lost: -2, flees: -1, hides: -1, wounded: -2, injured: -2,
  collapses: -2, despair: -3, grief: -3, mourns: -3, funeral: -3, corpse: -3, hospital: -1,
  escapes: 2, escaped: 2, rescues: 3, rescued: 3, saves: 3, saved: 3, reunited: 3, reunites: 3,
  marries: 3, married: 2, wedding: 3, reconciles: 3, reconcile: 3, forgives: 3, wins: 3, won: 2,
  succeeds: 3, freed: 3, frees: 2, survives: 2, recovers: 2, celebrates: 3, embrace: 2,
  embraces: 2, kiss: 2, kisses: 2, smiles: 2, together: 1, home: 1, born: 2, birth: 2,
};

const valenceOf = word => (word in PLOT_VALENCE ? PLOT_VALENCE[word] : afinn165[word] || 0);

export function splitSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?]["”']?)\s+(?=[A-Z"“'(])/)
    .map(s => s.trim())
    .filter(s => s.length > 12);
}

const POINTS = 12;

function zscore(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return sd < 1e-9 ? values.map(() => 0) : values.map(v => (v - mean) / sd);
}

function correlation(a, b) {
  const za = zscore(a);
  const zb = zscore(b);
  return za.reduce((sum, v, i) => sum + v * zb[i], 0) / za.length;
}

const TEMPLATES = ARCS.map(arc => ({
  id: arc.id,
  curve: Array.from({ length: POINTS }, (_, i) => arc.shape(i / (POINTS - 1))),
}));

/** The fortune curve: sentence valence smoothed along the telling, as z-scores. */
export function fortuneCurve(sentences) {
  const lengths = sentences.map(s => s.length);
  const total = lengths.reduce((a, b) => a + b, 0);
  let cursor = 0;
  const marks = sentences.map((sentence, i) => {
    const mid = (cursor + lengths[i] / 2) / total;
    cursor += lengths[i];
    const words = sentence.toLowerCase().match(/[a-z']+/g) || [];
    const sum = words.reduce((acc, word) => acc + valenceOf(word), 0);
    return { mid, value: sum / Math.sqrt(Math.max(4, words.length)) };
  });
  const bandwidth = 0.11;
  const raw = Array.from({ length: POINTS }, (_, i) => {
    const t = i / (POINTS - 1);
    let weight = 0;
    let value = 0;
    for (const mark of marks) {
      const k = Math.exp(-((mark.mid - t) ** 2) / (2 * bandwidth * bandwidth));
      weight += k;
      value += k * mark.value;
    }
    return weight ? value / weight : 0;
  });
  return zscore(raw);
}

export function classifyArc(curve) {
  let best = { id: null, fit: -1 };
  for (const template of TEMPLATES) {
    const fit = correlation(curve, template.curve);
    if (fit > best.fit) best = { id: template.id, fit };
  }
  return best;
}

/** Beats per third of the telling: [{ id, acts: [n1, n2, n3] }]. */
export function findBeats(sentences) {
  const lengths = sentences.map(s => s.length);
  const total = lengths.reduce((a, b) => a + b, 0);
  const counts = new Map();
  let cursor = 0;
  sentences.forEach((sentence, i) => {
    const mid = (cursor + lengths[i] / 2) / total;
    cursor += lengths[i];
    const act = mid < 1 / 3 ? 0 : mid < 2 / 3 ? 1 : 2;
    const lower = sentence.toLowerCase();
    for (const beat of BEATS) {
      if (beat.re.test(lower)) {
        if (!counts.has(beat.id)) counts.set(beat.id, [0, 0, 0]);
        counts.get(beat.id)[act] += 1;
      }
    }
  });
  return [...counts.entries()].map(([id, acts]) => ({ id, acts }));
}

/** Everything the Story light reads from one plot summary, or null without enough text. */
export function analysePlot(text) {
  if (!text) return null;
  const sentences = splitSentences(text);
  if (sentences.length < 8) return null;
  const curve = fortuneCurve(sentences);
  const arc = classifyArc(curve);
  return {
    sentences: sentences.length,
    curve: curve.map(v => Math.round(v * 100) / 100),
    arc: arc.fit >= 0.45 ? arc.id : null,
    arcFit: Math.round(arc.fit * 100) / 100,
    beats: findBeats(sentences),
  };
}

export function curveSimilarity(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, correlation(a, b));
}
