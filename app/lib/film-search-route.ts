import type { FilmSearchResult } from './film-search.ts';

type Options = {
  getToken: () => string;
  createClient: (options: { token: string }) => { searchFilms(query: string): Promise<FilmSearchResult[]> };
};
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
export function createFilmSearchGet({ getToken, createClient }: Options) {
  return async (request: Request): Promise<Response> => {
    const query = new URL(request.url).searchParams.get('q')?.trim() || '';
    if (query.length < 2 || query.length > 160) return Response.json({ error: 'Enter between 2 and 160 characters.' }, { status: 400, headers });
    const token = getToken().trim();
    if (!token) return Response.json({ error: 'Film search is temporarily unavailable. Try again shortly.' }, { status: 503, headers });
    try {
      const films = await createClient({ token }).searchFilms(query);
      return Response.json({ films }, { headers });
    } catch {
      return Response.json({ error: 'Film search could not connect. Try again.' }, { status: 502, headers });
    }
  };
}
