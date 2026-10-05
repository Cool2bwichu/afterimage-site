import test from 'node:test';
import assert from 'node:assert/strict';
import { JOURNEYS, MOODS, moodPoint, nameMood, parseRoute, routeBrief, routeRequest } from '../app/lib/credits-question.ts';
import { buildDevelopPayload, canDevelop } from '../app/lib/reel-state.ts';

test('every point on the map has a word, and the named moods name themselves', () => {
  for (const mood of MOODS) assert.equal(nameMood({ x: mood.x, y: mood.y }), mood.word);
  assert.equal(nameMood({ x: 0.1, y: 0.95 }), 'wired');
  assert.equal(nameMood({ x: 0.95, y: 0.05 }), 'at peace');
  assert.equal(nameMood({ x: Number.NaN, y: 2 }), 'restless', 'a broken point is clamped, never thrown');
  assert.deepEqual(moodPoint('low'), { x: 0.2, y: 0.42 });
  assert.deepEqual(moodPoint('not a mood'), moodPoint('somewhere in between'));
});

test('the map runs heavy to light and still to charged, as the page drew it', () => {
  const at = (word: string) => moodPoint(word);
  assert.ok(at('wrung out').x < 0.3 && at('wrung out').y < 0.3, 'heavy and still sit bottom left');
  assert.ok(at('wired').x < 0.3 && at('wired').y > 0.7, 'heavy and charged sit top left');
  assert.ok(at('at peace').x > 0.7 && at('at peace').y < 0.3, 'light and still sit bottom right');
  assert.ok(at('giddy').x > 0.7 && at('giddy').y > 0.7, 'light and charged sit top right');
});

test('the suggested journeys only use words on the map, and each one goes somewhere', () => {
  const words = new Set(MOODS.map(mood => mood.word));
  for (const journey of JOURNEYS) {
    assert.ok(words.has(journey.from) && words.has(journey.to));
    assert.notEqual(journey.from, journey.to);
  }
});

test('the route becomes an ordinary reel request the bridge already accepts', () => {
  const request = routeRequest({ now: 'wrung out', credits: 'restored', double: false });
  assert.deepEqual(request.films, []);
  assert.ok(canDevelop(request.films, request.creativeBrief));
  assert.match(request.creativeBrief, /^Right now I feel wrung out\. By the time the credits roll, I want to feel restored\./);
  assert.match(request.creativeBrief, /how the film moves me/);
  assert.doesNotMatch(request.creativeBrief, /double feature/);
  assert.equal(buildDevelopPayload(request.films, request.creativeBrief).creativeBrief, request.creativeBrief, 'nothing is trimmed away');
});

test('a double feature asks for the first two films as a pair, in order', () => {
  const brief = routeBrief({ now: 'numb', credits: 'feeling something', double: true });
  assert.match(brief, /This is a double feature: make the first two films a pair/);
  assert.match(brief, /the first meeting me where I am and the second carrying me the rest of the way/);
});

test('staying put is a route too: company, not a rescue', () => {
  const brief = routeBrief({ now: 'low', credits: 'Low', double: false });
  assert.match(brief, /Stay with me where I am/);
  assert.doesNotMatch(brief, /route between the two/);
});

test('the route can be read back out of the brief for the strip above the reel', () => {
  for (const route of [
    { now: 'wired', credits: 'ready for sleep', double: false },
    { now: 'somewhere in between', credits: 'giddy', double: true },
  ]) assert.deepEqual(parseRoute(routeBrief(route)), route);
  assert.equal(parseRoute(undefined), null);
  assert.equal(parseRoute('Something slow and Japanese, about trains.'), null);
  assert.equal(parseRoute('I said: Right now I feel low. By the time the credits roll, I want to feel lifted.'), null, 'only a brief this entrance wrote');
});

test('every brief fits inside the request limit, whatever words are typed', () => {
  const long = 'x'.repeat(400);
  const brief = routeBrief({ now: long, credits: long, double: true });
  assert.ok(brief.length <= 1200);
  assert.equal(parseRoute(brief)?.now, 'x'.repeat(40));
  for (const from of MOODS) for (const to of MOODS) assert.ok(routeBrief({ now: from.word, credits: to.word, double: true }).length <= 1200);
});
