import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLikedFilms,toggleLikedFilm,TASTE_STORAGE_KEY} from '../app/lib/taste-profile.ts';
import {withCurrentExclusions} from '../app/lib/reel-state.ts';

test('likes round-trip independently, deduplicate and undo without disturbing the request',()=>{
  const film={title:'After Yang',year:'2021'};
  const likes=toggleLikedFilm([],film);
  assert.deepEqual(parseLikedFilms(JSON.stringify([...likes,{...film,title:'after yang'}])),likes);
  assert.deepEqual(toggleLikedFilm(likes,film),[]);
  assert.notEqual(TASTE_STORAGE_KEY,'afterimage:mobile-state');
  const input={films:[],creativeBrief:'Energetic comedy',likedFilms:likes};
  assert.deepEqual(withCurrentExclusions(input,[]),input);
  assert.deepEqual(parseLikedFilms('{broken'),[]);
  assert.deepEqual(parseLikedFilms('[{"title":"No year"}]'),[]);
});
