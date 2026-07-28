import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { getUsageCount } from '@/lib/rewards/usage-counter';
import { REWARD_EVERY_N_USES, REWARD_AMOUNT_STEEM } from '@/lib/rewards/constants';

/**
 * Read-only, unauthenticated (no payment needed) lookup so the UI can tell a
 * connected wallet, before they pay, whether their next premium check will
 * land on a reward threshold. Returns the current count plus how many more
 * uses are needed to hit the next reward — the client just checks
 * `usesUntilReward === 1` to know "this next one earns a reward".
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const address = request.nextUrl.searchParams.get('address');

  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: 'Missing or invalid "address" query param' }, { status: 400 });
  }

  const count = await getUsageCount(address);
  const usesUntilReward = REWARD_EVERY_N_USES - (count % REWARD_EVERY_N_USES);

  return NextResponse.json({
    count,
    usesUntilReward,
    rewardEveryNUses: REWARD_EVERY_N_USES,
    rewardAmountSteem: REWARD_AMOUNT_STEEM,
  });
}
