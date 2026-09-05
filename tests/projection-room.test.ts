import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseAfterimageResultV2, parseStoredState, getRecommendationIdentity} from '../app/lib/reel-state.ts';
import {parseFilmEnrichment} from '../app/lib/movie-metadata.ts';
import {createTmdbClient} from '../app/lib/tmdb.server.ts';
const fixture=()=>JSON.parse(readFileSync(new URL('./fixtures/light-table.json',import.meta.url),'utf8'));

test('verified program notes survive stored reel hydration without requiring engine-specific UI',()=>{
 const reel=fixture();reel.recommendations[0].programNotes={carriesThrough:'Composed spaces and restrained feeling.',takesYouFurther:'A more speculative setting.'};
 const saved=parseStoredState(JSON.stringify({version:4,films:reel.sourceFilms,creativeBrief:'',result:reel,activeJobId:null,metadataByKey:{},excludedFilms:[]}));
 assert.deepEqual(saved.result?.recommendations[0].programNotes,reel.recommendations[0].programNotes);
});
test('malformed optional program notes leave the ordinary recommendation intact',()=>{
 const reel=fixture();reel.recommendations[0].programNotes={carriesThrough:'x'.repeat(241),takesYouFurther:'difference'};
 const parsed=parseAfterimageResultV2(reel);
 assert.equal(parsed?.recommendations.length,5);assert.equal(parsed?.recommendations[0].programNotes,undefined);
});
test('backdrops come from verified provider paths and unsafe persisted URLs are rejected',async()=>{
 const client=createTmdbClient({token:'test-token',fetchImpl:(async(url)=>String(url).includes('/search/movie')?Response.json({results:[{id:2,title:'Film',original_title:'Film',release_date:'2001-01-01'}]}):Response.json({backdrop_path:'/scene.jpg',poster_path:'/poster.jpg',overview:'',runtime:95,release_date:'2001-01-01',genres:[],production_countries:[],credits:{crew:[]}})) as typeof fetch});
 const record=await client.enrichOne({title:'Film',year:'2001',key:'film|2001'});
 assert.equal(record.status,'matched');assert.equal(record.status==='matched'&&record.backdropUrl,'https://image.tmdb.org/t/p/w1280/scene.jpg');
 assert.ok(parseFilmEnrichment(record));
 assert.equal(parseFilmEnrichment({...record,backdropUrl:'https://untrusted.example/scene.jpg'}),null);
});

test('a retained reel keeps its own request while a different accepted blend is pending',()=>{
 const reel=fixture();
 const previous={films:['Paris, Texas'],creativeBrief:'Patient longing.',experience:'light-table-v1'};
 const next={films:[],creativeBrief:'',experience:'light-table-v1',selectedFacets:{howItLooks:{...reel.recommendations[2].facets.howItLooks,source:{title:'Columbus',year:'2017'}}}};
 const identity=getRecommendationIdentity(reel);
 // Use the same public identity helper that binds selections and displayed input.
 const base={version:4,films:previous.films,creativeBrief:previous.creativeBrief,result:reel,experience:'light-table-v1',metadataByKey:{},excludedFilms:[],activeJobId:'11111111-1111-4111-8111-111111111111',acceptedInput:next,acceptedInputJobId:'11111111-1111-4111-8111-111111111111',displayedInput:previous,displayedReelIdentity:identity};
 const stored=parseStoredState(JSON.stringify(base));
 assert.deepEqual(stored.displayedInput,previous);assert.deepEqual(stored.acceptedInput,next);
 const stale=parseStoredState(JSON.stringify({...base,displayedReelIdentity:'a different reel'}));
 assert.equal(stale.displayedInput,undefined);
});
