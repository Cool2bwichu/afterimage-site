import { env } from 'cloudflare:workers';
import { createEnrichmentPost } from '../../../lib/enrichment-route';
import { createTmdbClient } from '../../../lib/tmdb.server';

type AfterimageRuntime = { TMDB_READ_TOKEN?: string };

export const dynamic = 'force-dynamic';

export const POST = createEnrichmentPost({
  getToken: () => {
    const runtime = env as AfterimageRuntime;
    return runtime.TMDB_READ_TOKEN || process.env.TMDB_READ_TOKEN || '';
  },
  createClient: ({ token }) => createTmdbClient({ token }),
});
