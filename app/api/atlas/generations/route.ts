import { forwardToBridge } from '../../_bridge';

export async function POST(request: Request) {
  return forwardToBridge('/v2/atlas/generations', request, { timeoutMs: 12000 });
}
