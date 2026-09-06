import { env } from 'cloudflare:workers';
import { createFilmSearchGet } from '../../../lib/film-search-route';
import { createTmdbClient } from '../../../lib/tmdb.server';

export const dynamic = 'force-dynamic';
export const GET = createFilmSearchGet({
  getToken: () => (env as { TMDB_READ_TOKEN?: string }).TMDB_READ_TOKEN || process.env.TMDB_READ_TOKEN || '',
  createClient: ({ token }) => createTmdbClient({ token }),
});
