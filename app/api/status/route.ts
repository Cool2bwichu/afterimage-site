import { forwardToBridge } from '../_bridge';

export const dynamic = 'force-dynamic';

export async function GET() {
  return forwardToBridge('/v1/auth/status');
}
