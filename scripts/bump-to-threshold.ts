import { recordPremiumUse } from '../lib/rewards/usage-counter';

const TEST_PAYER = '0xa323C97D71Aa765f44C9570b4cd1a4Eb79d23A6b';

async function main() {
  // Current count is 21 (per the live API check) — one more use lands on 22,
  // eight more after that (30 total needed) to hit the next multiple of 10.
  // Advance to 29 (usesUntilReward should become 1) without triggering
  // sendReward itself, just to verify the threshold math the UI relies on.
  for (let i = 0; i < 8; i++) {
    const count = await recordPremiumUse(TEST_PAYER, `threshold-bump-${Date.now()}-${i}`);
    console.log('count now:', count);
  }
}

main();
