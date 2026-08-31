import type { EnrichmentInput, FilmEnrichment } from './movie-metadata.ts';
import { validateEnrichmentInput } from './movie-metadata.ts';

type EnrichmentClient = { enrichMany(inputs: EnrichmentInput[]): Promise<FilmEnrichment[]> };

type FactoryOptions = {
  getToken: () => string;
  createClient: (options: { token: string }) => EnrichmentClient;
};

const JSON_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function readBoundedJson(request: Request, limit = 8 * 1024): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) throw Object.assign(new Error('Payload too large.'), { status: 413 });
  if (!request.body) throw Object.assign(new Error('Invalid JSON.'), { status: 400 });

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw Object.assign(new Error('Payload too large.'), { status: 413 });
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw Object.assign(new Error('Invalid JSON.'), { status: 400 });
  }
}

export function createEnrichmentPost({ getToken, createClient }: FactoryOptions) {
  return async function POST(request: Request): Promise<Response> {
    const token = getToken().trim();
    if (!token) return json({ error: 'Film metadata is not configured.', code: 'METADATA_NOT_CONFIGURED' }, 503);

    let inputs: EnrichmentInput[];
    try {
      inputs = validateEnrichmentInput(await readBoundedJson(request));
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'status' in error && error.status === 413 ? 413 : 400;
      return json({ error: status === 413 ? 'Request is too large.' : 'Film metadata request is invalid.', code: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST' }, status);
    }

    try {
      const films = await createClient({ token }).enrichMany(inputs);
      return json({ films }, 200);
    } catch {
      return json({ error: 'Film metadata is temporarily unavailable.', code: 'METADATA_UNAVAILABLE' }, 502);
    }
  };
}
