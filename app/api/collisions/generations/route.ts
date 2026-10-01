import { forwardToBridge } from '../../_bridge';

export async function POST(request: Request) {
  return forwardToBridge('/v2/collisions/generations', request, { timeoutMs: 12000 });
}
