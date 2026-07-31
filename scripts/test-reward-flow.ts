// Standalone test of the reward pipeline (Redis dedup/count + on-chain
// distributeReward), bypassing the real x402 payment flow — simulates 10
// distinct "payments" (unique nonces) for one payer address and confirms
// a reward fires exactly once, on the 10th.
import { recordPremiumUse } from '../lib/rewards/usage-counter';
import { sendReward } from '../lib/rewards/distribute-reward';

const TEST_PAYER = '0xa323C97D71Aa765f44C9570b4cd1a4Eb79d23A6b';

async function main() {
  console.log(`Testing reward flow for payer ${TEST_PAYER}\n`);

  for (let i = 1; i <= 10; i++) {
    const nonce = `test-nonce-${Date.now()}-${i}`;
    const count = await recordPremiumUse(TEST_PAYER, nonce);
    console.log(`Use #${i}: recordPremiumUse -> count=${count}`);

    if (count !== null && count % 10 === 0) {
      console.log(`  Threshold hit at count=${count}, sending reward...`);
      const result = await sendReward(TEST_PAYER);
      console.log('  sendReward result:', result);
    }
  }

  // Dedup check: replaying an already-used nonce must NOT increment the counter again.
  const dedupeNonce = 'test-nonce-dedupe-check';
  const first = await recordPremiumUse(TEST_PAYER, dedupeNonce);
  const second = await recordPremiumUse(TEST_PAYER, dedupeNonce);
  console.log(`\nDedupe check: first=${first}, second (replay, should be null)=${second}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
