import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
const route = await readFile(new URL('../app/api/develop/route.ts', import.meta.url), 'utf8');
const generationRoute = await readFile(new URL('../app/api/generations/route.ts', import.meta.url), 'utf8');
const jobRoute = await readFile(new URL('../app/api/generations/[jobId]/route.ts', import.meta.url), 'utf8');
const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
const card = await readFile(new URL('../app/components/recommendation-card.tsx', import.meta.url), 'utf8');
const dossier = await readFile(new URL('../app/components/film-dossier.tsx', import.meta.url), 'utf8');
const enrichmentRoute = await readFile(new URL('../app/api/films/enrich/route.ts', import.meta.url), 'utf8');

test('the private Site proxy targets the protected V2 bridge route', () => {
  assert.match(route, /forwardToBridge\('\/v2\/generate', request\)/);
  assert.doesNotMatch(route, /\/v1\/generate/);
  assert.match(generationRoute, /forwardToBridge\('\/v2\/generations', request, \{ timeoutMs: 12_000 \}\)/);
  assert.match(jobRoute, /isGenerationJobId\(jobId\)/);
  assert.match(jobRoute, /encodeURIComponent\(jobId\)/);
});

test('the page wires the flexible V2 state contract into readiness, payload, and hydration', () => {
  for (const helper of ['buildDevelopPayload', 'canDevelop', 'getInputStatus', 'parseStoredState', 'parseJobStart', 'parseJobStatus', 'pollGeneration']) {
    assert.match(page, new RegExp(`\\b${helper}\\b`));
  }
  assert.match(page, /canDevelop\(films, creativeBrief\)/);
  assert.match(page, /JSON\.stringify\(buildDevelopPayload\(films, creativeBrief\)\)/);
  assert.match(page, /parseStoredState\(localStorage\.getItem\(STORAGE_KEY\)\)/);
  assert.match(page, /version: 3/);
  assert.match(page, /metadataByKey/);
});

test('the page starts, resumes, and explicitly acknowledges generation jobs', () => {
  assert.match(page, /fetch\('\/api\/generations'/);
  assert.match(page, /fetch\(`\/api\/generations\/\$\{encodeURIComponent\(activeJobId\)\}`/);
  assert.match(page, /Resuming the reel already in the gate\./);
  assert.match(page, /That reel job has expired\. Your inputs are still here—develop it again\./);
  assert.match(page, /Finding the reel in the darkroom —/);
  assert.match(page, /Threading the reel —/);
  assert.match(page, />\s*Develop again\s*</);
  assert.match(page, />Dismiss</);
});

test('the optional inputs use the approved copy and client boundaries', () => {
  assert.match(page, /Add films you love, describe what you are searching for,\s+or combine both\./);
  assert.match(page, /Reference Reel · Optional/);
  assert.match(page, /Primary or supporting · \{creativeBrief\.length\}\/1200/);
  assert.match(page, /maxLength=\{160\}/);
  assert.match(page, /films\.length >= 20/);
});

test('the visible source reel cannot change while a generation is in flight', () => {
  const removeButton = page.match(/<button[^>]*onClick=\{\(\) => removeFilm\(index\)\}[^>]*>/)?.[0];
  assert.ok(removeButton);
  assert.match(removeButton, /disabled=\{reelLocked\}/);
  assert.match(page, /const reelLocked = developing \|\| Boolean\(activeJobId\)/);
});

test('recommendation cards expose collective program notes and no one-film pairing', () => {
  assert.match(card, /className="watch-for"/);
  assert.match(card, /recommendation\.watchFor/);
  assert.doesNotMatch(page + card + dossier, /pairsWith|pairs-with/i);
  assert.match(css, /\.watch-for\s*\{/);
  assert.doesNotMatch(css, /\.pairs-with\s*\{/);
  assert.match(card, /TOTAL SYNTHESIS/);
});

test('posters and dossiers use only the private enrichment route and verified IMDb IDs', () => {
  assert.match(page, /fetchFilmEnrichment/);
  assert.match(enrichmentRoute, /TMDB_READ_TOKEN/);
  assert.match(card, /poster-frame/);
  assert.match(dossier, /imdbUrl\(matched\.imdbId\)/);
  assert.match(dossier, /Why it belongs/i);
  assert.match(dossier, /What to watch for/i);
  assert.doesNotMatch(page + card + dossier + enrichmentRoute, /JustWatch|watch\/providers|streaming provider/i);
  assert.match(page, /This product uses the TMDB API but is not endorsed or certified by TMDB\./);
});
