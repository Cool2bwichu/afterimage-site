import { forwardToBridge } from '../../_bridge';
import { isGenerationJobId } from '../../../lib/generation-state';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { jobId } = await params;
  if (!isGenerationJobId(jobId)) {
    return Response.json(
      { error: 'This reel job is no longer available.', code: 'JOB_NOT_FOUND' },
      {
        status: 404,
        headers: {
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  }

  return forwardToBridge('/v2/generations/' + encodeURIComponent(jobId), undefined, {
    timeoutMs: 12_000,
  });
}
