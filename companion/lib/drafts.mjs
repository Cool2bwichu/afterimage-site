// A draft is the part of an answer Claude has finished writing so far, shown
// while a job runs so a reel can develop on screen instead of arriving all at
// once. It carries only finished, bounded display fields. It is provisional:
// the validators still decide the finished answer, which can differ, and a
// second take starts a new draft.
import { parsePartialJson } from './partial-json.mjs';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const YEAR = /^\d{4}$/;
export const DRAFT_INTERVAL_MS = 400;
const MAX_PARTIAL_CHARACTERS = 120000;

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value, max) {
  if (typeof value !== 'string') return '';
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length > max ? cleaned.slice(0, max - 1).trimEnd() + '…' : cleaned;
}

function texts(value, max, count) {
  return Array.isArray(value) ? value.map((item) => text(item, max)).filter(Boolean).slice(0, count) : [];
}

function film(value, extra = {}) {
  if (!isRecord(value)) return null;
  const title = text(value.title, 160);
  const year = typeof value.year === 'string' && YEAR.test(value.year) ? value.year : '';
  if (!title || !year) return null;
  const draft = { title, year };
  for (const [key, max] of Object.entries(extra)) {
    const field = text(value[key], max);
    if (field) draft[key] = field;
  }
  return draft;
}

function films(value, extra, count) {
  return Array.isArray(value) ? value.map((item) => film(item, extra)).filter(Boolean).slice(0, count) : [];
}

// Each shape keeps what the site can show while the answer develops.
export const DRAFT_SHAPES = Object.freeze({
  reel(value) {
    if (!isRecord(value)) return {};
    const draft = {};
    const persona = text(value.persona, 80);
    const insight = text(value.insight, 600);
    const palette = Array.isArray(value.palette) ? value.palette.filter((color) => typeof color === 'string' && HEX_COLOR.test(color)).slice(0, 5) : [];
    const sensibilities = texts(value.sensibilities, 80, 3);
    const director = isRecord(value.spiritDirector) ? text(value.spiritDirector.name, 120) : '';
    const recommendations = films(value.recommendations, { reason: 600 }, 5);
    if (persona) draft.persona = persona;
    if (insight) draft.insight = insight;
    if (palette.length) draft.palette = palette;
    if (sensibilities.length) draft.sensibilities = sensibilities;
    if (director) draft.spiritDirector = director;
    if (recommendations.length) draft.recommendations = recommendations;
    return draft;
  },
  replacement(value) {
    const recommendation = isRecord(value) ? film(value.recommendation, { reason: 600 }) : null;
    return recommendation ? { recommendation } : {};
  },
  atlas(value) {
    if (!isRecord(value)) return {};
    const draft = {};
    const thesis = text(value.thesis, 400);
    const neighbors = films(value.neighbors, { label: 80 }, 8);
    if (thesis) draft.thesis = thesis;
    if (neighbors.length) draft.neighbors = neighbors;
    return draft;
  },
  collision(value) {
    const between = isRecord(value) ? film(value.film, { reason: 600 }) : null;
    return between ? { film: between } : {};
  },
});

// Turns the answer's text, as it streams, into drafts: parsed at most every
// `intervalMs`, published only when something visible changed.
export function createDraftReporter({ kind, onDraft, now = Date.now, intervalMs = DRAFT_INTERVAL_MS }) {
  const shape = DRAFT_SHAPES[kind];
  if (typeof onDraft !== 'function' || !shape) return null;
  let take = 1;
  let last = '';
  let lastParsedAt = -Infinity;

  const publish = (draft) => {
    const serialized = JSON.stringify(draft);
    if (serialized === last) return;
    last = serialized;
    try { onDraft(draft); } catch {}
  };

  return {
    partial(answerText) {
      if (typeof answerText !== 'string' || answerText.length > MAX_PARTIAL_CHARACTERS) return;
      const current = now();
      if (current - lastParsedAt < intervalMs) return;
      lastParsedAt = current;
      const fields = shape(parsePartialJson(answerText));
      if (Object.keys(fields).length) publish({ take, ...fields });
    },
    // The first answer failed validation; what it showed no longer stands.
    retake() {
      take += 1;
      lastParsedAt = -Infinity;
      publish({ take });
    },
  };
}
