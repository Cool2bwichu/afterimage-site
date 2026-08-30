import { env } from 'cloudflare:workers';

const DEFAULT_TIMEOUT_MS = 150_000;

type AfterimageRuntime = {
  AFTERIMAGE_BRIDGE_URL?: string;
  AFTERIMAGE_BRIDGE_SECRET?: string;
};

export async function forwardToBridge(path: string, request?: Request) {
  const runtime = env as AfterimageRuntime;
  const bridgeUrl = runtime.AFTERIMAGE_BRIDGE_URL || process.env.AFTERIMAGE_BRIDGE_URL;
  const bridgeSecret = runtime.AFTERIMAGE_BRIDGE_SECRET || process.env.AFTERIMAGE_BRIDGE_SECRET;

  if (!bridgeUrl || !bridgeSecret) {
    return Response.json(
      { error: 'The private intelligence service has not been connected yet.', code: 'BRIDGE_NOT_CONFIGURED' },
      { status: 503 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const headers = new Headers({
      Accept: 'application/json',
      Authorization: `Bearer ${bridgeSecret}`,
    });
    let body: string | undefined;
    if (request && request.method !== 'GET' && request.method !== 'HEAD') {
      headers.set('Content-Type', 'application/json');
      body = await request.text();
    }

    const upstream = await fetch(new URL(path, bridgeUrl), {
      method: request?.method || 'GET',
      headers,
      body,
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await upstream.text();

    return new Response(payload, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return Response.json(
      {
        error: timedOut
          ? 'The reel took too long to return. Your films are still saved.'
          : 'The private intelligence service is temporarily unreachable.',
        code: timedOut ? 'BRIDGE_TIMEOUT' : 'BRIDGE_UNREACHABLE',
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
