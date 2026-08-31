import { forwardToBridge } from '../_bridge';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return forwardToBridge('/v2/generate', request);
}
