import assert from 'node:assert/strict';
import test from 'node:test';

import { PLATE_MOTIFS, complement, facetWords, plateDesign, plateMarkup, plateMotif, plateSvg, reelMotifs } from '../app/lib/plate.ts';

const palette = ['#101820', '#2b3a42', '#c8a97e', '#e8dcc8', '#7a3b2e'];
const film = { title: 'Paris, Texas', year: '1984', palette };

test('the same film always develops the same plate', () => {
  assert.equal(plateSvg(film), plateSvg({ ...film }));
  assert.notEqual(plateSvg(film), plateSvg({ ...film, title: 'Wings of Desire', year: '1987' }));
});

test('a film’s words choose what its plate shows', () => {
  assert.equal(plateMotif({ title: 'A', year: '2000', words: ['Neon city at night'] }), 'city');
  assert.equal(plateMotif({ title: 'A', year: '2000', words: ['a desert road', 'summer heat'] }), 'sun');
  assert.equal(plateMotif({ title: 'A', year: '2000', words: ['family home', 'domestic quiet'] }), 'window');
  assert.ok(PLATE_MOTIFS.includes(plateMotif({ title: 'No words', year: '1999' })));
});

test('films of one reel never draw the same picture, even when they share every word', () => {
  const films = ['One', 'Two', 'Three', 'Four', 'Five'].map(title => ({ title, year: '2001', words: ['patient restraint', 'quiet family home'] }));
  const motifs = reelMotifs(films);
  assert.equal(new Set(motifs).size, 5);
  assert.equal(motifs[0], 'window');
  assert.deepEqual(reelMotifs(films), motifs);
});

test('a plate is coloured by the reel, and each film leads with a different colour', () => {
  const first = plateDesign({ ...film, index: 0 });
  const second = plateDesign({ ...film, index: 1 });
  assert.notEqual(first.lead, second.lead);
  for (const design of [first, second]) for (const color of [design.ground, design.deep, design.lead, design.second, design.light, design.ghost]) assert.match(color, /^#[0-9a-f]{6}$/);
});

test('a black-and-white reel keeps its plates black and white', () => {
  const design = plateDesign({ title: 'Persona', year: '1966', palette: ['#1a1a1a', '#4a4a48', '#8c8c88', '#d9d6cf', '#f2efe8'] });
  for (const color of [design.lead, design.second]) {
    const value = parseInt(color.slice(1), 16);
    const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    assert.ok(Math.max(...channels) - Math.min(...channels) < 40, `${color} should be near grey`);
  }
});

test('a missing or damaged palette still makes a plate', () => {
  for (const bad of [undefined, [], ['red', 'javascript:alert(1)'], ['#fff']]) {
    const markup = plateMarkup({ title: 'Untitled', year: '2020', palette: bad });
    assert.match(markup, /<rect/);
    assert.doesNotMatch(markup, /javascript|red"/);
  }
});

test('the markup holds nothing from the film’s title or words', () => {
  const markup = plateMarkup({ title: '<script>alert(1)</script>', year: '"><img>', palette, words: ['<b>city</b>'] }, { id: 'p1' });
  assert.doesNotMatch(markup, /script|<img|<b>/);
});

test('every motif draws in every shape, and ids keep plates apart', () => {
  for (const motif of PLATE_MOTIFS) for (const shape of ['poster', 'wide', 'square'] as const) {
    const markup = plateMarkup({ ...film, motif }, { shape, id: `p-${motif}` });
    assert.doesNotMatch(markup, /NaN|undefined|Infinity/);
    assert.ok(markup.includes(`id="p-${motif}-glow"`));
  }
  assert.doesNotMatch(plateMarkup(film, { grain: false, ghost: false }), /feTurbulence|feGaussianBlur/);
});

test('the ghost is the complement of the lead colour', () => {
  assert.match(complement('#ff0000'), /^#[0-9a-f]{6}$/);
  const [r, g, b] = [1, 3, 5].map(at => parseInt(complement('#ff2200').slice(at, at + 2), 16));
  assert.ok(b > r && g > r, 'the complement of red is blue-green');
  assert.equal(complement('nonsense'), '#9cbbb9');
});

test('facet words gather labels and traits', () => {
  assert.deepEqual(facetWords({ howItFeels: { label: 'Patient longing', traits: ['slow', 'tender'] } }), ['Patient longing', 'slow', 'tender']);
  assert.deepEqual(facetWords(undefined), []);
});
