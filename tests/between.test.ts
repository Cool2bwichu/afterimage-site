import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_GUEST_FILMS, betweenRequest, canMeet, cleanName, decodeInvite, encodeInvite, inviteUrl, parseBetween } from '../app/lib/between.ts';
import { buildDevelopPayload, canDevelop } from '../app/lib/reel-state.ts';
import { parseEvening } from '../app/lib/evening.ts';

const mick = { name: 'Mick', films: [{ title: 'Columbus', year: '2017' }, { title: 'Paris, Texas', year: '1984' }, { title: 'Tokyo Story', year: '1953' }] };
const sam = { name: 'Sam', films: [{ title: 'Mad Max: Fury Road', year: '2015' }, { title: 'Paddington 2' }] };

test('two people and their films become one ordinary reel request', () => {
  const request = betweenRequest(mick, sam)!;
  assert.deepEqual(request.films, ['Columbus (2017)', 'Paris, Texas (1984)', 'Tokyo Story (1953)', 'Mad Max: Fury Road (2015)', 'Paddington 2']);
  assert.match(request.creativeBrief, /^Two of us are choosing a film to watch together\. Mick loves Columbus \(2017\), Paris, Texas \(1984\) and Tokyo Story \(1953\); Sam loves Mad Max: Fury Road \(2015\) and Paddington 2\./);
  assert.match(request.creativeBrief, /say what Mick and Sam will find in it/);
  assert.ok(canDevelop(request.films, request.creativeBrief));
  const payload = buildDevelopPayload(request.films, request.creativeBrief);
  assert.deepEqual(payload.films, request.films, 'nothing is lost on the way to the bridge');
  assert.ok(request.creativeBrief.length <= 1200);
});

test('a film is judged by whichever of the two it suits less', () => {
  const brief = betweenRequest(mick, sam)!.creativeBrief;
  assert.match(brief, /Judge each film by whichever of us it suits less/);
  assert.match(brief, /a perfect fit for one of us never makes up for a poor fit for the other/);
  assert.doesNotMatch(brief, /evening is about/, 'any length says nothing');
});

test('the evening can have a length, and every film has to fit inside it', () => {
  const request = betweenRequest(mick, sam, 120)!;
  assert.match(request.creativeBrief, /The evening is about two hours, so every film must finish inside that\.$/);
  assert.equal(parseEvening(request.creativeBrief), 120);
  assert.deepEqual(parseBetween(request.creativeBrief), { first: 'Mick', second: 'Sam' });
});

test('every brief fits inside the request limit, however long the titles', () => {
  const long = (name: string) => ({ name: 'A name that is long enough', films: [1, 2, 3].map(n => ({ title: `${name} ${n} `.repeat(30).trim().slice(0, 160), year: '1999' })) });
  const request = betweenRequest(long('Ours'), long('Theirs'), 240)!;
  assert.ok(request.creativeBrief.length <= 1200, `${request.creativeBrief.length} characters`);
  assert.match(request.creativeBrief, /The evening is about four hours/, 'the instructions survive the long titles');
  assert.equal(buildDevelopPayload(request.films, request.creativeBrief).creativeBrief, request.creativeBrief, 'nothing is trimmed away');
  assert.ok(request.films.every(film => film.length > 160), 'the films themselves keep their full titles');
});

test('both people need at least one film, and nobody brings more than three', () => {
  assert.equal(canMeet(mick, { name: 'Sam', films: [] }), false);
  assert.equal(betweenRequest(mick, { name: 'Sam', films: [{ title: '   ' }] }), null);
  const greedy = { name: 'Ana', films: ['A', 'B', 'C', 'D', 'A'].map(title => ({ title })) };
  assert.equal(betweenRequest(greedy, sam)!.films.length, MAX_GUEST_FILMS + 2);
  assert.deepEqual(betweenRequest({ name: '', films: [{ title: 'Heat' }, { title: 'heat' }] }, sam)!.films.slice(0, 1), ['Heat']);
});

test('names are optional, and the reel can still be read back', () => {
  const anonymous = betweenRequest({ name: '', films: mick.films }, { name: '  ', films: sam.films })!;
  assert.match(anonymous.creativeBrief, /One of us loves .+; the other loves /);
  assert.match(anonymous.creativeBrief, /say what each of us will find in it/);
  assert.deepEqual(parseBetween(anonymous.creativeBrief), { first: 'One of us', second: 'the other' });
  assert.deepEqual(parseBetween(betweenRequest(mick, sam)!.creativeBrief), { first: 'Mick', second: 'Sam' });
  assert.equal(parseBetween('Something slow.'), null);
  assert.equal(cleanName('  Ana <script>  '), 'Ana script');
  assert.equal(cleanName('A very long name that keeps going on'), 'A very long name that ke');
  assert.match(betweenRequest({ name: 'Sam', films: mick.films }, sam)!.creativeBrief, /One of us loves/, 'two people with one name are still two people');
});

test('an invitation carries only a name and three films, and survives the trip', () => {
  const code = encodeInvite({ name: 'Mick', films: [...mick.films, { title: 'Yi Yi', year: '2000' }] });
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeInvite(code), { name: 'Mick', films: mick.films });
  const accented = decodeInvite(encodeInvite({ name: 'Zoë', films: [{ title: 'Amélie', year: '2001' }, { title: '花樣年華' }] }));
  assert.deepEqual(accented, { name: 'Zoë', films: [{ title: 'Amélie', year: '2001' }, { title: '花樣年華' }] });
  const url = new URL(inviteUrl('https://example.test/afterimage-site/?welcome=1#reel=abc', mick));
  assert.equal(url.pathname, '/afterimage-site/');
  assert.equal(url.hash, '');
  assert.deepEqual([...url.searchParams.keys()], ['between']);
});

test('a damaged or empty invitation is simply no invitation', () => {
  for (const code of [null, '', '%%%', 'bm90IGpzb24', btoa(JSON.stringify({ v: 2, f: [['A', '']] })), btoa(JSON.stringify({ v: 1, f: [] })), btoa(JSON.stringify({ v: 1, f: 'Columbus' }))]) {
    assert.equal(decodeInvite(code), null);
  }
});
