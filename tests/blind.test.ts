import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLIND_KEY, emptyBlind, isRevealed, isVeiled, liftVeil, parseBlind, redact, reelArrived, reveal, secretsFor, serializeBlind,
  spokenRedaction, veiledName, wantBlind,
} from '../app/lib/blind.ts';
import { getRecommendationIdentity } from '../app/lib/reel-state.ts';

const shown = (text: string, secrets: string[]) => redact(text, secrets).map(segment => segment.hidden ? '▇' : segment.text).join('');

test('the veil covers only the reel that arrives after it was asked for', () => {
  const asked = wantBlind(emptyBlind(), true);
  assert.equal(isVeiled(asked, 'reel-a'), false, 'nothing is veiled until a reel arrives');
  const veiled = reelArrived(asked, 'reel-a');
  assert.equal(veiled.pending, false);
  assert.equal(isVeiled(veiled, 'reel-a'), true);
  assert.equal(isVeiled(veiled, 'reel-b'), false, 'another reel, a saved one or a replacement, is never veiled');
  assert.equal(reelArrived(veiled, 'reel-b'), veiled, 'only an asked-for reel takes the veil');
  assert.equal(isVeiled(liftVeil(veiled), 'reel-a'), false);
  assert.equal(isVeiled(wantBlind(emptyBlind(), false), ''), false);
});

test('choosing a film lifts the veil on that film alone', () => {
  const veiled = reelArrived(wantBlind(emptyBlind(), true), 'reel-a');
  const chosen = reveal(veiled, { title: 'Columbus', year: '2017' });
  assert.equal(isRevealed(chosen, { title: 'columbus', year: '2017' }), true);
  assert.equal(isRevealed(chosen, { title: 'After Yang', year: '2022' }), false);
  assert.equal(reveal(chosen, { title: 'Columbus', year: '2017' }), chosen);
  assert.equal(isRevealed(liftVeil(chosen), { title: 'After Yang', year: '2022' }), true);
});

test('the veil is kept in its own record and survives damage', () => {
  assert.equal(BLIND_KEY, 'afterimage:blind:v1');
  const state = reveal(reelArrived(wantBlind(emptyBlind(), true), getRecommendationIdentity({ recommendations: [{ title: 'Columbus', year: '2017', timecode: '', reason: '', watchFor: '' }] })), { title: 'Columbus', year: '2017' });
  assert.deepEqual(parseBlind(serializeBlind(state)), state);
  assert.deepEqual(parseBlind('{not json'), emptyBlind());
  assert.deepEqual(parseBlind(JSON.stringify({ version: 2, pending: true })), emptyBlind());
  assert.deepEqual(parseBlind(JSON.stringify({ version: 1, pending: 'yes', revealed: [1, 'a|2000', 'a|2000'], lifted: 1 })), { version: 1, pending: false, revealed: ['a|2000'], lifted: false });
});

test('a reason keeps its meaning with the names drawn out of it', () => {
  const secrets = secretsFor({ title: 'Columbus', year: '2017', directors: ['Kogonada'] }, [{ title: 'After Yang', year: '2022' }]);
  assert.equal(shown('Kogonada’s Columbus (2017) treats buildings the way After Yang treats memory.', secrets), '▇’s ▇ (▇) treats buildings the way ▇ treats memory.');
  assert.equal(shown('columbus, in lower case, is still the title.', secrets), '▇, in lower case, is still the title.');
});

test('articles, subtitles and surnames are secrets too', () => {
  const secrets = secretsFor({ title: 'The Worst Person in the World', year: '2021', directors: ['Joachim Trier'] });
  assert.equal(shown('Trier lets Worst Person in the World breathe.', secrets), '▇ lets ▇ breathe.');
  const subtitled = secretsFor({ title: 'Mad Max: Fury Road', year: '2015' });
  assert.equal(shown('Fury Road never stops; neither does Mad Max.', subtitled), '▇ never stops; neither does ▇.');
});

test('a short title is drawn out only as written, so ordinary words survive', () => {
  const secrets = secretsFor({ title: 'Her', year: '2013' });
  assert.equal(shown('Her voice carries the film, and her absence too.', secrets), '▇ voice carries the film, and her absence too.');
  assert.equal(shown('Heresy is not a title.', secrets), 'Heresy is not a title.', 'whole words only');
});

test('accents and apostrophes do not let a name slip through', () => {
  const secrets = secretsFor({ title: "Pan's Labyrinth", year: '2006', directors: ['Guillermo del Toro'] });
  assert.equal(shown('Pan’s Labyrinth is Guillermo’s fairy tale; del Toro means it.', secrets), '▇ is ▇’s fairy tale; del ▇ means it.');
  const sciamma = secretsFor({ title: 'Portrait of a Lady on Fire', year: '2019', directors: ['Céline Sciamma'] });
  assert.equal(shown('Céline Sciamma paints with looks.', sciamma), '▇ paints with looks.');
});

test('screen readers hear where something was withheld', () => {
  const segments = redact('Columbus is about looking.', ['Columbus']);
  assert.equal(spokenRedaction(segments), '(withheld) is about looking.');
  assert.deepEqual(redact('', ['Columbus']), []);
  assert.deepEqual(redact('Nothing to hide.', []), [{ text: 'Nothing to hide.', hidden: false }]);
  assert.deepEqual([0, 1, 2, 3, 4].map(veiledName), ['Film I', 'Film II', 'Film III', 'Film IV', 'Film V']);
});
