import { tool } from 'ai';
import { z } from 'zod';
import { encodeFunctionData, decodeFunctionResult } from 'viem';
import { SUPPORTED_CHAINS, ETHERSCAN_CHAIN_IDS, type Chain } from '../chains';
import { etherscanCall, sleep } from '../etherscan';
import { mapWithConcurrency } from '../concurrency';

const CHAIN_CONCURRENCY = 2;
// Same reasoning as wallet-holdings-tool.ts: scanning every supported chain
// for a contract, each with several eth_call reads, could otherwise run
// well past a reasonable response time. Chains not yet started when the
// deadline passes are reported as skipped (unknown), never silently folded
// into "not deployed here".
const TIME_BUDGET_MS = 45_000;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const BURN_ADDRESS = '0x000000000000000000000000000000000000dead';

const ERC20_READ_ABI = [
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { name: 'name', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
] as const;

type ReadableField = 'totalSupply' | 'decimals' | 'name' | 'symbol' | 'owner';

// module=proxy actions (eth_call, eth_getCode) respond with a raw JSON-RPC
// shape ({result} or {error}), not the {status, message, result} envelope
// etherscanCall()/lib/etherscan.ts expects — that helper's retry logic keys
// off `status`, which proxy responses never have, so it would silently
// double-fetch every single call. This is a dedicated, single-purpose
// caller for proxy actions only.
async function etherscanProxyCall(
  params: Record<string, string>,
  apiKey: string,
): Promise<{ ok: true; result: string } | { ok: false; error: string }> {
  const url = new URL('https://api.etherscan.io/v2/api');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('apikey', apiKey);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      const data = (await res.json()) as { status?: string; message?: string; result?: string; error?: { message: string } };
      if (data.error) {
        if (attempt === 0) {
          await sleep(400);
          continue;
        }
        return { ok: false, error: data.error.message };
      }
      // Under real load (concurrent chains, free-tier limits), Etherscan can respond to a
      // module=proxy call with its STANDARD {status:"0",message,result} error envelope instead
      // of the JSON-RPC shape — e.g. rate limiting or an unsupported chain on the free tier.
      // `result` is then a human-readable error STRING, not hex data. Treating any truthy
      // string result as success previously made these errors look like "contract bytecode".
      if (data.status === '0') {
        if (attempt === 0) {
          await sleep(400);
          continue;
        }
        return { ok: false, error: data.result || data.message || 'Unknown error' };
      }
      if (typeof data.result === 'string' && /^0x[0-9a-fA-F]*$/.test(data.result)) {
        return { ok: true, result: data.result };
      }
      return { ok: false, error: 'Unexpected proxy response shape' };
    } catch (err) {
      if (attempt === 1) return { ok: false, error: err instanceof Error ? err.message : String(err) };
      await sleep(400);
    }
  }
  return { ok: false, error: 'unreachable' };
}

async function readContractField<T>(
  contractAddress: `0x${string}`,
  functionName: ReadableField,
  chainId: string,
  apiKey: string,
): Promise<T | null> {
  const data = encodeFunctionData({ abi: ERC20_READ_ABI, functionName });
  const res = await etherscanProxyCall(
    { chainid: chainId, module: 'proxy', action: 'eth_call', to: contractAddress, data, tag: 'latest' },
    apiKey,
  );
  if (!res.ok) return null;
  try {
    return decodeFunctionResult({ abi: ERC20_READ_ABI, functionName, data: res.result as `0x${string}` }) as T;
  } catch {
    return null;
  }
}

// Keyword-presence heuristics over verified source code, not a real static
// analyzer — deliberately conservative naming ("present in source") rather
// than claiming to know what a flagged function actually does or whether
// it's meaningfully access-restricted.
const SOURCE_CODE_FLAGS: Array<{ pattern: RegExp; flag: string }> = [
  { pattern: /function\s+_?mint\s*\(/i, flag: 'a mint function is present in source' },
  { pattern: /function\s+_?pause\s*\(|whenNotPaused/i, flag: 'a pause function is present (transfers could be frozen)' },
  { pattern: /blacklist|blocklist|isBlacklisted|isBlocked/i, flag: 'blacklist/blocklist logic is present (specific addresses could be blocked from transacting)' },
  {
    pattern: /function\s+(set|update)(Tax|Fee)s?\s*\(/i,
    flag: 'a function to change the transfer tax/fee after deployment is present',
  },
  { pattern: /function\s+excludeFromFee\s*\(/i, flag: 'fee-exclusion logic is present (some addresses may be exempt from tax)' },
  { pattern: /function\s+setMaxTx|maxTransactionAmount/i, flag: 'a max-transaction-amount control is present' },
];

type ChainTokenomics = {
  chain: Chain;
  verified: boolean | null;
  contractName: string | null;
  isProxyContract: boolean | null;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupply: string | null;
  totalSupplyRaw: string | null;
  ownerAddress: string | null;
  ownershipRenounced: boolean | null;
  sourceCodeFlags: string[];
  note: string;
};

/**
 * Checks a single chain for tokenomics evidence on a contract address.
 * Cheap first (eth_getCode — does a contract even exist here), then only
 * pays for the expensive part (source fetch + 5 eth_call reads) when that
 * cheap check confirms bytecode is actually present, so scanning many
 * chains for an address only deployed on one or two of them stays fast.
 *
 * Returns `null` when no contract exists at this address on this chain, or
 * `'skipped'` when called after `deadline` has already passed — callers
 * must report that distinctly from "checked, nothing there" (see
 * chainsSkippedDueToTimeBudget below).
 */
async function checkChainTokenomics(
  contractAddress: `0x${string}`,
  chain: Chain,
  apiKey: string,
  deadline: number,
): Promise<ChainTokenomics | null | 'skipped'> {
  if (Date.now() > deadline) return 'skipped';

  const chainId = String(ETHERSCAN_CHAIN_IDS[chain]);

  const codeRes = await etherscanProxyCall(
    { chainid: chainId, module: 'proxy', action: 'eth_getCode', address: contractAddress, tag: 'latest' },
    apiKey,
  );
  if (!codeRes.ok || !codeRes.result || codeRes.result === '0x') {
    return null;
  }

  if (Date.now() > deadline) {
    return {
      chain,
      verified: null,
      contractName: null,
      isProxyContract: null,
      name: null,
      symbol: null,
      decimals: null,
      totalSupply: null,
      totalSupplyRaw: null,
      ownerAddress: null,
      ownershipRenounced: null,
      sourceCodeFlags: [],
      note: `A contract exists on ${chain} but the time budget was reached before anything else about it could be checked.`,
    };
  }

  const [sourceRes, totalSupply, decimalsRaw, name, symbol, owner] = await Promise.all([
    etherscanCall({ chainid: chainId, module: 'contract', action: 'getsourcecode', address: contractAddress }, apiKey),
    readContractField<bigint>(contractAddress, 'totalSupply', chainId, apiKey),
    readContractField<bigint>(contractAddress, 'decimals', chainId, apiKey),
    readContractField<string>(contractAddress, 'name', chainId, apiKey),
    readContractField<string>(contractAddress, 'symbol', chainId, apiKey),
    readContractField<string>(contractAddress, 'owner', chainId, apiKey),
  ]);

  let verified: boolean | null = null;
  let contractName: string | null = null;
  let isProxyContract: boolean | null = null;
  let sourceCodeFlags: string[] = [];

  if (sourceRes.status === '1' && Array.isArray(sourceRes.result) && sourceRes.result[0]) {
    const r = sourceRes.result[0] as { SourceCode: string; ContractName: string; Proxy: string };
    verified = r.SourceCode.length > 0;
    contractName = r.ContractName || null;
    isProxyContract = r.Proxy === '1';
    if (verified) {
      sourceCodeFlags = SOURCE_CODE_FLAGS.filter(f => f.pattern.test(r.SourceCode)).map(f => f.flag);
    }
  }

  const decimals = decimalsRaw !== null ? Number(decimalsRaw) : null;
  const totalSupplyFormatted =
    totalSupply !== null && decimals !== null
      ? (Number(totalSupply) / 10 ** decimals).toLocaleString('en-US', { maximumFractionDigits: 2 })
      : null;
  const ownershipRenounced =
    owner !== null ? owner.toLowerCase() === ZERO_ADDRESS || owner.toLowerCase() === BURN_ADDRESS : null;

  const notes = [
    verified === false ? 'Contract source is not verified on the block explorer — sourceCodeFlags could not be checked.' : null,
    isProxyContract
      ? 'This is a proxy contract — its own source is just a thin forwarding shell (sourceCodeFlags only reflects that, not the real logic in the separate implementation contract), and the logic can be changed at any time by upgrading the implementation, which no static check can see.'
      : null,
    owner === null ? 'No public owner() getter responded — either ownership uses a different access-control pattern, or it could not be determined.' : null,
  ].filter(Boolean);

  return {
    chain,
    verified,
    contractName,
    isProxyContract,
    name,
    symbol,
    decimals,
    totalSupply: totalSupplyFormatted,
    totalSupplyRaw: totalSupply !== null ? totalSupply.toString() : null,
    ownerAddress: owner,
    ownershipRenounced,
    sourceCodeFlags,
    note: notes.join(' '),
  };
}

/**
 * Live source: Etherscan's unified V2 API (contract existence, source
 * verification, and ERC-20 metadata reads via eth_call) across every chain
 * in SUPPORTED_CHAINS by default — pass `chain` only to narrow to one the
 * user explicitly named. A token contract deployed at the same address on
 * multiple chains (common with CREATE2 deployments) shows up under each.
 *
 * This tool returns raw evidence only; it does NOT compute a "tokenomics is
 * good" verdict — the agent synthesizes that from the evidence so the
 * reasoning stays inspectable rather than hidden in tool code.
 *
 * Known limitations, surfaced rather than hidden:
 *  - Holder concentration: Etherscan's token-holder-list is a paid-tier
 *    feature, not available here.
 *  - Liquidity lock: requires a dedicated per-DEX/per-chain LP-lock scanner,
 *    not wired up.
 *  - sourceCodeFlags are keyword-presence heuristics over verified source
 *    text, not a real static analyzer — they flag that a pattern exists,
 *    never what it actually does or whether it's meaningfully restricted.
 *  - ownershipRenounced is null (unknown) whenever the contract has no
 *    standard public owner() getter — that is NOT the same as renounced.
 */
export const tokenomicsTool = tool({
  description:
    "Check a token contract's tokenomics evidence (supply, decimals, ownership/renouncement, source-code red-flag patterns) across ALL supported chains by default, to help judge whether the tokenomics look sound. Pass `chain` only to narrow to a single chain the user explicitly named.",
  inputSchema: z.object({
    contractAddress: z.string(),
    chain: z.enum(SUPPORTED_CHAINS).optional(),
  }),
  execute: async ({ contractAddress, chain }) => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
      return {
        error: `"${contractAddress}" doesn't look like a valid contract address (expected 0x followed by 40 hex characters).`,
      };
    }

    const apiKey = process.env.ETHERSCAN_API_KEY;
    if (!apiKey) {
      return {
        source: 'stub-no-live-data',
        note: 'ETHERSCAN_API_KEY is not set. Add it to .env.local (free key at https://etherscan.io/apis) to enable live tokenomics checks.',
      };
    }

    try {
      const deadline = Date.now() + TIME_BUDGET_MS;
      const chainsToCheck: Chain[] = chain ? [chain] : [...SUPPORTED_CHAINS];
      const address = contractAddress as `0x${string}`;
      const results = await mapWithConcurrency(chainsToCheck, CHAIN_CONCURRENCY, c =>
        checkChainTokenomics(address, c, apiKey, deadline),
      );

      const chainsWithContract = results.filter((r): r is ChainTokenomics => r !== null && r !== 'skipped');
      const chainsSkippedDueToTimeBudget = chainsToCheck.filter((_, i) => results[i] === 'skipped');

      const noteParts = [
        chain
          ? null
          : `Checked ${chainsToCheck.length - chainsSkippedDueToTimeBudget.length} of ${chainsToCheck.length} supported chains within the time budget; found a contract at this address on ${chainsWithContract.length}${
              chainsWithContract.length > 0 ? ` (${chainsWithContract.map(c => c.chain).join(', ')})` : ''
            }.`,
        chainsSkippedDueToTimeBudget.length > 0
          ? `${chainsSkippedDueToTimeBudget.length} chain(s) not checked at all due to the time budget — this is NOT the same as "no contract there", it means unknown: ${chainsSkippedDueToTimeBudget.join(', ')}.`
          : null,
        chainsWithContract.length === 0 && chainsSkippedDueToTimeBudget.length === 0
          ? chain
            ? `No contract found at this address on ${chain}.`
            : 'No contract found at this address on any chain checked.'
          : null,
      ].filter(Boolean);

      return {
        source: 'etherscan-v2',
        contractAddress,
        chainsChecked: chainsToCheck.length,
        chainsSkippedDueToTimeBudget,
        chainsWithContract,
        note: noteParts.join(' '),
        unverifiedFields: {
          note: 'holderConcentration and liquidityLocked have no live data source wired up (Etherscan holder lists require a paid tier; liquidity-lock checks need a dedicated per-DEX scanner) — treat both as unknown, not as evidence of safety.',
        },
      };
    } catch (err) {
      return {
        error: `Tokenomics check failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
});
