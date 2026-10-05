import test from 'node:test';
import assert from 'node:assert/strict';
import { canTurn, parseTurn, reelQualities, turnBrief, turnRequest } from '../app/lib/keep-lose.ts';
import { buildDevelopPayload, canDevelop } from '../app/lib/reel-state.ts';
import type { FacetMap } from '../app/lib/light-table.ts';

const facet = (label: string, explanation = `${label}, explained.`) => ({ label, explanation, traits: [] });
const fingerprint: FacetMap = {
  whereItLives: facet('Quiet suburban interiors'),
  howItFeels: facet('Tender melancholy', 'Grief held gently, never pressed for tears'),
  howItLooks: facet('Muted natural light'),
  howItSpeaks: facet('Spare, patient dialogue'),
};
const reel = [
  { title: 'After Yang', year: '2021' }, { title: 'Columbus', year: '2017' }, { title: 'Cure', year: '1997' },
  { title: 'Millennium Mambo', year: '2001' }, { title: 'The Green Ray', year: '1986' },
];

test('a reel with a fingerprint offers its four channels to keep or lose', () => {
  const qualities = reelQualities({ fingerprint, sensibilities: ['ignored'] });
  assert.deepEqual(qualities.map(quality => quality.channel), ['where it lives', 'how it feels', 'how it looks', 'how it speaks']);
  assert.equal(qualities[1].label, 'Tender melancholy');
  assert.equal(qualities[1].explanation, 'Grief held gently, never pressed for tears');
});

test('without a fingerprint, the reel’s sensibilities stand in, once each', () => {
  const qualities = reelQualities({ sensibilities: ['Quiet grief', 'quiet grief', '  ', 'Long takes', '"Rain"'] });
  assert.deepEqual(qualities.map(quality => quality.label), ['Quiet grief', 'Long takes', 'Rain']);
  assert.ok(qualities.every(quality => !quality.channel));
  assert.deepEqual(reelQualities({}), []);
});

test('the turn becomes an ordinary reel request that keeps one thing and loses another', () => {
  const [lives, feels] = reelQualities({ fingerprint });
  const request = turnRequest({ keep: feels, lose: lives }, reel);
  assert.deepEqual(request.films, [], 'no reference films: the kept quality is the anchor, not the old reel');
  assert.match(request.creativeBrief, /^Turn my last reel: keep “Tender melancholy” \(how it feels\) and lose “Quiet suburban interiors” \(where it lives\)\./);
  assert.match(request.creativeBrief, /The last reel was After Yang \(2021\), Columbus \(2017\), Cure \(1997\), Millennium Mambo \(2001\) and The Green Ray \(1986\)\./);
  assert.match(request.creativeBrief, /What to keep: Grief held gently, never pressed for tears\. What to lose: Quiet suburban interiors, explained\./);
  assert.match(request.creativeBrief, /without simply swapping in its opposite/);
  assert.ok(canDevelop(request.films, request.creativeBrief));
  assert.equal(buildDevelopPayload(request.films, request.creativeBrief).creativeBrief, request.creativeBrief, 'nothing is trimmed away');
});

test('what was kept and lost can be read back for the line above the new reel', () => {
  const [lives, feels] = reelQualities({ fingerprint });
  assert.deepEqual(parseTurn(turnBrief({ keep: feels, lose: lives }, reel)), { keep: 'Tender melancholy', lose: 'Quiet suburban interiors' });
  const [grief, takes] = reelQualities({ sensibilities: ['Quiet grief', 'Long takes'] });
  assert.deepEqual(parseTurn(turnBrief({ keep: takes, lose: grief }, [])), { keep: 'Long takes', lose: 'Quiet grief' });
  assert.equal(parseTurn('Something slow.'), null);
  assert.equal(parseTurn(undefined), null);
});

test('you cannot keep and lose the same thing', () => {
  const [lives, feels] = reelQualities({ fingerprint });
  assert.equal(canTurn({ keep: lives, lose: lives }), false);
  assert.equal(canTurn({ keep: lives, lose: feels }), true);
  assert.equal(canTurn(null), false);
});

test('every brief fits inside the request limit, however long the words', () => {
  const long = 'An extraordinarily long and winding quality description '.repeat(10);
  const wordy: FacetMap = { whereItLives: facet(long, long), howItFeels: facet(long, long), howItLooks: facet(long, long), howItSpeaks: facet(long, long) };
  const [first, second] = reelQualities({ fingerprint: wordy });
  const titles = reel.map(film => ({ ...film, title: film.title.repeat(20) }));
  const brief = turnBrief({ keep: first, lose: second }, titles);
  assert.ok(brief.length <= 1200, `${brief.length} characters`);
  assert.match(brief, /In each reason, say what the film keeps and what it lets go\.$/, 'the instructions survive');
  assert.ok(parseTurn(brief));
});
