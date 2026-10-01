import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { BLANK_SENTENCE, cycleWord, hasAnswer, questionRequest, sentenceBrief, SENTENCE_WORDS } from '../app/lib/one-question.ts';
import { EYE_AXES, createEyeTest, eyeTestRequest } from '../app/lib/eye-test.ts';
import { canDevelop } from '../app/lib/reel-state.ts';

function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

test('each word of the sentence steps through its options and back to blank, both ways', () => {
  let choice = BLANK_SENTENCE;
  const mood = SENTENCE_WORDS.find(word => word.key === 'mood')!;
  for (const option of mood.options) {
    choice = cycleWord(choice, 'mood');
    assert.equal(mood.options[choice.mood], option);
  }
  assert.equal(cycleWord(choice, 'mood').mood, -1, 'after the last option comes blank again');
  assert.equal(cycleWord(BLANK_SENTENCE, 'mood', -1).mood, mood.options.length - 1, 'backwards from blank is the last option');
  assert.deepEqual(BLANK_SENTENCE, { mood: -1, company: -1, time: -1 }, 'cycling never mutates');
});

test('the sentence says only what was filled in', () => {
  assert.equal(sentenceBrief(BLANK_SENTENCE), '');
  assert.equal(sentenceBrief({ mood: 1, company: -1, time: -1 }), 'Something tender to watch.');
  assert.equal(sentenceBrief({ mood: 1, company: 0, time: 0 }), 'Something tender to watch alone, tonight.');
  assert.equal(sentenceBrief({ mood: -1, company: 1, time: 1 }), 'Something to watch with someone, in under two hours.');
});

test('the answer becomes an ordinary reel request: a chosen film is a reference, words are guidance', () => {
  assert.equal(questionRequest('   ', null, BLANK_SENTENCE), null);
  assert.equal(hasAnswer(' ', null, BLANK_SENTENCE), false);

  const chosen = questionRequest('ignored once a film is chosen', { title: 'Paris, Texas', year: '1984' }, { mood: 1, company: -1, time: 0 });
  assert.deepEqual(chosen, { films: ['Paris, Texas (1984)'], creativeBrief: 'Something tender to watch, tonight.' });

  const typed = questionRequest('the ending of Aftersun!!', null, BLANK_SENTENCE);
  assert.deepEqual(typed, { films: [], creativeBrief: 'What stayed with me: the ending of Aftersun.' });

  const sentenceOnly = questionRequest('', null, { mood: 3, company: 2, time: -1 });
  assert.deepEqual(sentenceOnly, { films: [], creativeBrief: 'Something strange to watch with friends.' });

  for (const request of [chosen!, typed!, sentenceOnly!]) {
    assert.ok(canDevelop(request.films, request.creativeBrief));
    assert.ok(request.creativeBrief.length <= 1200);
  }
});

test('the Eye Test deck holds real films once each, with a look and three colours', () => {
  const seen = new Set<string>();
  for (const axis of EYE_AXES) {
    assert.equal(axis.poles.length, 2);
    for (const pole of axis.poles) {
      assert.ok(pole.films.length >= 2, `${axis.key}: ${pole.name}`);
      for (const film of pole.films) {
        const key = `${film.title}|${film.year}`;
        assert.equal(seen.has(key), false, `${key} appears once`);
        seen.add(key);
        assert.match(film.year, /^(19|20)\d{2}$/);
        assert.ok(film.look.length > 8 && film.look.length < 80);
        assert.equal(film.palette.length, 3);
        film.palette.forEach(color => assert.match(color, /^#[0-9a-f]{6}$/));
      }
    }
  }
});

test('an Eye Test draws five pairs from five different axes, one film from each side', () => {
  for (let seed = 1; seed < 40; seed += 1) {
    const rounds = createEyeTest(seeded(seed));
    assert.equal(rounds.length, 5);
    assert.equal(new Set(rounds.map(round => round.axis)).size, 5);
    for (const round of rounds) {
      const axis = EYE_AXES.find(item => item.key === round.axis)!;
      const poles = round.frames.map(frame => frame.pole).sort();
      assert.deepEqual(poles, axis.poles.map(pole => pole.name).sort());
    }
    const titles = rounds.flatMap(round => round.frames.map(frame => frame.title));
    assert.equal(new Set(titles).size, 10);
  }
});

test('five choices become references and a brief that explains them', () => {
  const rounds = createEyeTest(seeded(7));
  const picks = [0, 1, 0, 1, 1] as const;
  const request = eyeTestRequest(rounds, picks);
  assert.deepEqual(request.films, rounds.map((round, index) => `${round.frames[picks[index]].title} (${round.frames[picks[index]].year})`));
  for (const [index, round] of rounds.entries()) {
    const chosen = round.frames[picks[index]];
    const other = round.frames[1 - picks[index]];
    assert.ok(request.creativeBrief.includes(`${chosen.pole} (${chosen.title} over ${other.title})`));
  }
  assert.match(request.creativeBrief, /not necessarily films I have seen/);
  assert.ok(request.creativeBrief.length <= 1200);
  assert.ok(canDevelop(request.films, request.creativeBrief));
});

test('the entrance asks one question and keeps the full composer one tap away', async () => {
  const landing = await readFile(new URL('../app/components/landing.tsx', import.meta.url), 'utf8');
  assert.match(landing, /What stayed<br \/><em>with you\?<\/em>/);
  assert.match(landing, /Take the Eye Test/);
  assert.match(landing, /Use the full composer/);
  assert.match(landing, /This product uses the TMDB API but is not endorsed or certified by TMDB\./);
  assert.doesNotMatch(landing, /role="tablist"/, 'the four-chapter tour is gone');
});
