import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const USAGE_KEY_PREFIX = 'steemie:premium-usage:';
const PROCESSED_KEY_PREFIX = 'steemie:premium-payment-processed:';
// A payment nonce is only ever valid for a bounded window (see the exact-EVM
// scheme's validBefore/validAfter authorization fields), so the dedupe marker
// doesn't need to outlive that — a generous 7 days bounds Redis growth.
const PROCESSED_TTL_SECONDS = 60 * 60 * 24 * 7;

/**
 * Read-only peek at an address's current premium-check count (0 if it has
 * never been used), so the UI can tell the user *before* they pay whether
 * their upcoming check will land on a reward threshold.
 */
export async function getUsageCount(payerAddress: string): Promise<number> {
  const usageKey = `${USAGE_KEY_PREFIX}${payerAddress.toLowerCase()}`;
  const count = await redis.get<number>(usageKey);
  return count ?? 0;
}

/**
 * Increments the premium-check usage count for a payer address, but only once
 * per unique payment (keyed by the x402 authorization nonce) — a retried or
 * replayed request with the same nonce won't double-count. Returns the new
 * count, or null if this nonce was already processed (so the caller can skip
 * reward logic entirely on a duplicate).
 */
export async function recordPremiumUse(payerAddress: string, paymentNonce: string): Promise<number | null> {
  const processedKey = `${PROCESSED_KEY_PREFIX}${paymentNonce}`;
  const firstTime = await redis.set(processedKey, '1', { nx: true, ex: PROCESSED_TTL_SECONDS });
  if (firstTime === null) {
    // Another call already processed this exact payment.
    return null;
  }

  const usageKey = `${USAGE_KEY_PREFIX}${payerAddress.toLowerCase()}`;
  return redis.incr(usageKey);
}
