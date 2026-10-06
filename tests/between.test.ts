import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_GUEST_FILMS, betweenCollision, betweenRequest, canMeet, cleanName, decodeInvite, encodeInvite, inviteUrl, parseBetween, sameSkies, skiesKey, skyNames, typedFilm,
} from '../app/lib/between.ts';
import { buildCollisionInput } from '../app/lib/collision.ts';
import { buildDevelopPayload, canDevelop } from '../app/lib/reel-state.ts';
import { validateCollisionInput } from '../companion/lib/collision-contract.mjs';

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

test('every brief fits inside the request limit, however long the titles', () => {
  const long = (name: string) => ({ name: 'A name that is long enough', films: [1, 2, 3].map(n => ({ title: `${name} ${n} `.repeat(30).trim().slice(0, 160), year: '1999' })) });
  const request = betweenRequest(long('Ours'), long('Theirs'))!;
  assert.ok(request.creativeBrief.length <= 1200, `${request.creativeBrief.length} characters`);
  assert.match(request.creativeBrief, /In each reason, say what each of us will find in it\.$/, 'the instructions survive the long titles');
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

test('a film typed by hand can bring its year, and titles with numbers keep them', () => {
  const now = new Date('2026-10-05T12:00:00Z');
  assert.deepEqual(typedFilm('Aftersun 2022', now), { title: 'Aftersun', year: '2022' });
  assert.deepEqual(typedFilm('  Paris, Texas (1984) ', now), { title: 'Paris, Texas', year: '1984' });
  assert.deepEqual(typedFilm('Paris, Texas, 1984', now), { title: 'Paris, Texas', year: '1984' });
  assert.deepEqual(typedFilm('Blade Runner 2049', now), { title: 'Blade Runner 2049' }, 'not a year yet');
  assert.deepEqual(typedFilm('THX 1138', now), { title: 'THX 1138' }, 'before cinema');
  assert.deepEqual(typedFilm('1917', now), { title: '1917' }, 'a title that is only a number stays a title');
  assert.deepEqual(typedFilm('Stalker', now), { title: 'Stalker' });
  assert.equal(typedFilm('   ', now), null);
});

test('each sky is named for its person, or for you and them', () => {
  assert.deepEqual(skyNames({ us: mick, them: sam }), ['Mick’s sky', 'Sam’s sky']);
  assert.deepEqual(skyNames({ us: { ...mick, name: '' }, them: sam }), ['your sky', 'Sam’s sky']);
  assert.deepEqual(skyNames({ us: mick, them: { ...sam, name: 'mick' } }), ['your sky', 'their sky'], 'one name for two people names neither');
});

test('two skies become a collision the bridge already answers', () => {
  const sky = { name: 'Sam', films: [{ title: 'Before Sunrise', year: '1995' }, { title: 'Lost in Translation', year: '2003' }, { title: 'Moonlight' }] };
  const ask = betweenCollision({ us: mick, them: sky })!;
  assert.deepEqual(ask.films, [{ title: 'Columbus', year: '2017' }, { title: 'Before Sunrise', year: '1995' }], 'one dated film stands for each sky');
  assert.deepEqual(ask.reelFilms, [{ title: 'Paris, Texas', year: '1984' }, { title: 'Tokyo Story', year: '1953' }, { title: 'Lost in Translation', year: '2003' }], 'the other dated films cannot be the answer');
  assert.match(ask.creativeBrief, /^Two of us are choosing one film to watch together\. Mick loves Columbus \(2017\), Paris, Texas \(1984\) and Tokyo Story \(1953\); Sam loves Before Sunrise \(1995\), Lost in Translation \(2003\) and Moonlight\./);
  assert.match(ask.creativeBrief, /The first film stands for the films Mick loves, the second for the films Sam loves/);
  assert.equal(parseBetween(ask.creativeBrief), null, 'a collision brief is never read back as a reel heading');
  const input = validateCollisionInput(buildCollisionInput(ask.films[0], ask.films[1], { creativeBrief: ask.creativeBrief, reelFilms: ask.reelFilms }));
  assert.equal(input.creativeBrief, ask.creativeBrief, 'the brief arrives whole');
  assert.equal(input.reelFilms.length, 3);
  const anonymous = betweenCollision({ us: { name: '', films: mick.films }, them: { name: '', films: sky.films } })!;
  assert.match(anonymous.creativeBrief, /One of us loves .+; the other loves .+\. The first film stands for the films one of us loves, the second for the films the other loves/);
});

test('the skies meet only when each has a film with its year, and not the same one', () => {
  assert.equal(betweenCollision({ us: mick, them: { name: 'Sam', films: [{ title: 'Paddington 2' }] } }), null);
  const same = { name: 'Sam', films: [{ title: 'Columbus', year: '2017' }] };
  assert.equal(betweenCollision({ us: { name: 'Mick', films: [{ title: 'Columbus', year: '2017' }] }, them: same }), null, 'one film cannot collide with itself');
  assert.deepEqual(betweenCollision({ us: mick, them: same })!.films, [{ title: 'Paris, Texas', year: '1984' }, { title: 'Columbus', year: '2017' }], 'a shared film stands for the other sky');
});

test('every collision brief fits the request limit, however long the titles and names', () => {
  const long = (name: string) => ({ name: 'A name that is long enough', films: [1, 2, 3].map(n => ({ title: `${name} ${n} `.repeat(30).trim().slice(0, 160), year: `199${n}` })) });
  const ask = betweenCollision({ us: long('Ours'), them: long('Theirs') })!;
  assert.ok(ask.creativeBrief.length <= 1200, `${ask.creativeBrief.length} characters`);
  assert.match(ask.creativeBrief, /not a compromise neither of us wanted\.$/, 'the instructions survive the long titles');
  assert.doesNotThrow(() => validateCollisionInput(buildCollisionInput(ask.films[0], ask.films[1], { creativeBrief: ask.creativeBrief, reelFilms: ask.reelFilms })));
});

test('the same names and films are the same skies, whatever the spacing', () => {
  const a = { us: mick, them: sam };
  assert.ok(sameSkies(a, { us: { ...mick, name: ' Mick ' }, them: { ...sam, films: [...sam.films] } }));
  assert.ok(!sameSkies(a, { us: mick, them: { ...sam, films: sam.films.slice(0, 1) } }));
  assert.ok(!sameSkies(null, a));
  assert.equal(skiesKey(a), skiesKey({ us: mick, them: sam }));
});
