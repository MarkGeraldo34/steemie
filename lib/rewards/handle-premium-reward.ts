import type { NextRequest } from 'next/server';
import type { Address } from 'viem';
import { recordPremiumUse } from './usage-counter';
import { sendReward } from './distribute-reward';
import { REWARD_EVERY_N_USES } from './constants';

interface ExactEvmAuthorization {
  from: string;
  nonce: string;
}

/**
 * Decodes the x402 `X-PAYMENT` header the client already sent to pay for
 * this request. By the time the route handler runs, `withX402` has already
 * verified this payment against the facilitator (see @x402/next's withX402:
 * settlement happens after the handler returns, but verification gates
 * access before it runs) — so it's safe to trust the payer address here
 * without re-verifying it ourselves.
 */
function getPayerFromRequest(request: NextRequest): ExactEvmAuthorization | null {
  const header = request.headers.get('X-PAYMENT');
  if (!header) return null;

  try {
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf-8'));
    const authorization = decoded?.payload?.authorization;
    if (typeof authorization?.from !== 'string' || typeof authorization?.nonce !== 'string') {
      return null;
    }
    return { from: authorization.from, nonce: authorization.nonce };
  } catch {
    return null;
  }
}

/**
 * Call after a premium-research request has succeeded. Increments the
 * caller's usage count and, every REWARD_EVERY_N_USES uses, sends them a
 * STEEM reward. Never throws — a failure here must not take down the paid
 * research response it's attached to; errors are only logged.
 */
export async function maybeRewardPremiumUse(request: NextRequest): Promise<void> {
  try {
    const payer = getPayerFromRequest(request);
    if (!payer) {
      console.warn('[rewards] No decodable X-PAYMENT header on a premium-research request; skipping usage count.');
      return;
    }

    const count = await recordPremiumUse(payer.from, payer.nonce);
    if (count === null) {
      // Duplicate/replayed payment nonce — already counted once.
      return;
    }

    if (count % REWARD_EVERY_N_USES === 0) {
      const result = await sendReward(payer.from as Address);
      if ('txHash' in result) {
        console.log(`[rewards] Sent reward to ${payer.from} at use #${count}: ${result.txHash}`);
      } else {
        console.warn(`[rewards] Reward due for ${payer.from} at use #${count} but skipped: ${result.skipped}`);
      }
    }
  } catch (error) {
    console.error('[rewards] Failed to process premium-use reward:', error);
  }
}
