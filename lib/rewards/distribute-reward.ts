import { createWalletClient, http, parseUnits, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { xLayer, xLayerTestnet } from 'viem/chains';
import { REWARD_AMOUNT_STEEM } from './constants';

const STEEMIE_TOKEN_ADDRESS = process.env.STEEMIE_TOKEN_ADDRESS as Address | undefined;
const DISTRIBUTOR_KEY = process.env.REWARD_DISTRIBUTOR_PRIVATE_KEY as `0x${string}` | undefined;
// Must match the network the x402 payment resource is registered on
// (lib/x402-server.ts registers 'eip155:196' — X Layer mainnet) unless
// explicitly overridden for a testnet trial run of the reward flow.
const isTestnet = process.env.STEEMIE_TOKEN_CHAIN === 'testnet';
const chain = isTestnet ? xLayerTestnet : xLayer;
// viem's built-in RPC defaults (xlayertestrpc.okx.com / xlayerrpc.okx.com)
// aren't reachable from every network; testrpc.xlayer.tech is the endpoint
// already confirmed working (same one the Hardhat deploy scripts use).
const rpcUrl = isTestnet
  ? (process.env.XLAYER_TESTNET_RPC ?? 'https://testrpc.xlayer.tech')
  : (process.env.XLAYER_MAINNET_RPC ?? 'https://rpc.xlayer.tech');

const distributeRewardAbi = [
  {
    type: 'function',
    name: 'distributeReward',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

/**
 * Sends the configured STEEM reward amount to `to` via the deployed
 * SteemieToken's `distributeReward`. No-ops (with a log) if the token isn't
 * configured yet — e.g. before the mainnet contract is deployed — so the
 * paid research response is never blocked on this being wired up.
 */
export async function sendReward(to: Address): Promise<{ txHash: `0x${string}` } | { skipped: string }> {
  if (!STEEMIE_TOKEN_ADDRESS || !DISTRIBUTOR_KEY) {
    console.warn(
      '[rewards] STEEMIE_TOKEN_ADDRESS or REWARD_DISTRIBUTOR_PRIVATE_KEY not set — skipping reward distribution.',
    );
    return { skipped: 'reward token not configured' };
  }

  const account = privateKeyToAccount(DISTRIBUTOR_KEY);
  const client = createWalletClient({ account, chain, transport: http(rpcUrl) });

  const txHash = await client.writeContract({
    address: STEEMIE_TOKEN_ADDRESS,
    abi: distributeRewardAbi,
    functionName: 'distributeReward',
    args: [to, parseUnits(REWARD_AMOUNT_STEEM, 18)],
  });

  return { txHash };
}
