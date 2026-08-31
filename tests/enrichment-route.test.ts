import test from 'node:test';
import assert from 'node:assert/strict';

import { createEnrichmentPost } from '../app/lib/enrichment-route.ts';

test('the enrichment route bounds input and never serializes the server token', async () => {
  const token = 'server-only-test-token';
  const POST = createEnrichmentPost({
    getToken: () => token,
    createClient: () => ({
      enrichMany: async (films) => films.map((film) => ({ ...film, status: 'unmatched' as const })),
    }),
  });
  const response = await POST(new Request('https://afterimage.test/api/films/enrich', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ films: [{ title: 'Paris, Texas', year: '1984' }] }),
  }));
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(body.includes(token), false);
});

test('missing configuration and malformed requests return safe bounded errors', async () => {
  const missing = createEnrichmentPost({ getToken: () => '', createClient: () => { throw new Error('unused'); } });
  assert.equal((await missing(new Request('https://afterimage.test', { method: 'POST', body: '{}' }))).status, 503);

  const configured = createEnrichmentPost({ getToken: () => 'token', createClient: () => { throw new Error('unused'); } });
  assert.equal((await configured(new Request('https://afterimage.test', { method: 'POST', body: '{bad' }))).status, 400);
});
