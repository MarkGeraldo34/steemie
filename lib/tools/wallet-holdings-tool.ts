import { tool } from 'ai';
import { z } from 'zod';
import {
  SUPPORTED_CHAINS,
  ETHERSCAN_CHAIN_IDS,
  COINGECKO_PLATFORM_IDS,
  NATIVE_COINGECKO_IDS,
  NATIVE_SYMBOLS,
  type Chain,
} from '../chains';

const MAX_TOKENS_PRICED = 15;
const CHAIN_CONCURRENCY = 2;
// Hard wall-clock ceiling for the whole scan. A wallet active on many chains
// with many tokens each could otherwise take minutes (32 chains x up to 15
// sequential, rate-limited CoinGecko price calls each) — well past any
// reasonable chat-response or serverless-function timeout. Once the deadline
// passes, chains not yet started are skipped (not silently reported as
// "empty" — see chainsSkippedDueToTimeBudget) and any chain mid-pricing
// returns what it already has, so the tool always resolves with a usable,
// honestly-labeled partial result instead of hanging or timing out outright.
const TIME_BUDGET_MS = 45_000;

type EtherscanTokenTx = {
  contractAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
};

type EtherscanResult = { status: string; message: string; result: unknown };

// Etherscan's free tier reports rate-limiting as an in-body status:"0" (not
// an HTTP 429), e.g. message "NOTOK" / result "Max rate limit reached" — so
// a plain non-'1' status can mean either "rate-limited" or "genuinely no
// data". This retries once on any non-'1' status before giving up, so a
// rate-limited call across 32 chains doesn't get silently misread as "wallet
// has nothing here".
async function etherscanCall(params: Record<string, string>, apiKey: string): Promise<EtherscanResult> {
  const url = new URL('https://api.etherscan.io/v2/api');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('apikey', apiKey);
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    const data = (await res.json()) as EtherscanResult;
    if (data.status === '1' || attempt === 1) return data;
    await sleep(500);
  }
  // unreachable, satisfies TS
  return { status: '0', message: 'NOTOK', result: [] };
}

// Runs async jobs with a concurrency cap so we don't burst past Etherscan's
// free-tier rate limit (3 req/sec, confirmed by testing) when checking many
// token balances — or many chains — at once.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// CoinGecko's free/keyless tier caps /simple/token_price/{platform} at ONE
// contract address per request (error_code 10012 if you send more) —
// batching many addresses in one call fails the whole request, not just the
// excess ones. So this fetches price per-token. That tier is also fairly
// aggressively rate-limited (429s observed under normal testing volume), so
// 429 specifically gets a longer backoff than a generic error, and callers
// get told WHY a price is missing (no market data vs. got rate-limited) —
// a rate-limited lookup should never be presented the same as "no price
// exists for this token".
async function fetchTokenPrice(
  contractAddress: string,
  chain: Chain,
): Promise<{ price: number | null; rateLimited: boolean }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/token_price/${COINGECKO_PLATFORM_IDS[chain]}?contract_addresses=${contractAddress}&vs_currencies=usd`,
    );
    if (res.ok) {
      const data = (await res.json()) as Record<string, { usd?: number }>;
      return { price: data[contractAddress.toLowerCase()]?.usd ?? null, rateLimited: false };
    }
    if (res.status === 429 && attempt < 2) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (res.status !== 429 && attempt === 0) {
      await sleep(400);
      continue;
    }
    return { price: null, rateLimited: res.status === 429 };
  }
  return { price: null, rateLimited: true };
}

// Fetches one token's balance, retrying once on rate-limit/error responses
// rather than silently treating a failed call as a zero balance.
async function fetchTokenBalance(t: EtherscanTokenTx, walletAddress: string, chainId: string, apiKey: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await etherscanCall(
      { chainid: chainId, module: 'account', action: 'tokenbalance', contractaddress: t.contractAddress, address: walletAddress },
      apiKey,
    );
    if (res.status === '1') {
      const raw = Number(res.result as string);
      return { ...t, amount: raw / 10 ** Number(t.tokenDecimal || '18'), lookupFailed: false };
    }
    if (attempt === 0) await sleep(400);
  }
  return { ...t, amount: 0, lookupFailed: true };
}

type ChainHoldings = {
  chain: Chain;
  native: {
    symbol: string;
    amount: number | null;
    usdPrice: number | null;
    usdValue: number | null;
  };
  tokens: Array<{
    name: string;
    symbol: string;
    contractAddress: string;
    amount: number;
    usdPrice: number | null;
    usdValue: number | null;
    priceUnavailableReason: 'rate-limited' | 'no-market-data' | 'not-priced-time-budget' | null;
  }>;
  totalUsdValueOfPricedHoldings: number;
  note: string;
};

/**
 * Checks a single chain for a wallet's native + ERC-20 holdings. Cheap first
 * (native balance + token-transfer history — 2 calls), then only pays for
 * the expensive part (per-token balance lookups + CoinGecko pricing) when
 * that cheap check actually found something, so scanning many chains for a
 * wallet that's only active on one or two of them stays fast.
 *
 * Returns `null` when the chain has no native balance and no token-transfer
 * history at all, so callers can drop empty chains without listing them.
 * Returns `'skipped'` when called after `deadline` has already passed — no
 * network calls are made, so callers must report this distinctly from a
 * genuinely empty chain (see chainsSkippedDueToTimeBudget below).
 */
async function checkChainHoldings(
  walletAddress: string,
  chain: Chain,
  apiKey: string,
  deadline: number,
): Promise<ChainHoldings | null | 'skipped'> {
  if (Date.now() > deadline) return 'skipped';

  const chainId = String(ETHERSCAN_CHAIN_IDS[chain]);

  const [nativeBalRes, tokenTxRes] = await Promise.all([
    etherscanCall({ chainid: chainId, module: 'account', action: 'balance', address: walletAddress, tag: 'latest' }, apiKey),
    etherscanCall(
      { chainid: chainId, module: 'account', action: 'tokentx', address: walletAddress, page: '1', offset: '200', sort: 'desc' },
      apiKey,
    ),
  ]);

  const nativeAmount = nativeBalRes.status === '1' ? Number(nativeBalRes.result as string) / 1e18 : null;
  const transfers =
    tokenTxRes.status === '1' && Array.isArray(tokenTxRes.result) ? (tokenTxRes.result as EtherscanTokenTx[]) : [];

  if ((nativeAmount === null || nativeAmount === 0) && transfers.length === 0) {
    return null;
  }

  const nativeSymbol = NATIVE_SYMBOLS[chain];
  const nativePriceRes =
    nativeAmount !== null && nativeAmount > 0
      ? await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${NATIVE_COINGECKO_IDS[chain]}&vs_currencies=usd`)
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null)
      : null;
  const nativePriceUsd = nativePriceRes?.[NATIVE_COINGECKO_IDS[chain]]?.usd ?? null;

  const native = {
    symbol: nativeSymbol,
    amount: nativeAmount,
    usdPrice: nativePriceUsd,
    usdValue: nativeAmount !== null && nativePriceUsd !== null ? nativeAmount * nativePriceUsd : null,
  };

  if (transfers.length === 0) {
    if (!nativeAmount) return null;
    return { chain, native, tokens: [], totalUsdValueOfPricedHoldings: native.usdValue ?? 0, note: '' };
  }

  if (Date.now() > deadline) {
    return {
      chain,
      native,
      tokens: [],
      totalUsdValueOfPricedHoldings: native.usdValue ?? 0,
      note: `Time budget reached before token holdings on ${chain} could be checked — this chain's ERC-20 balances are unknown, not necessarily zero.`,
    };
  }

  const uniqueTokens = new Map<string, EtherscanTokenTx>();
  for (const t of transfers) {
    if (!uniqueTokens.has(t.contractAddress)) uniqueTokens.set(t.contractAddress, t);
    if (uniqueTokens.size >= MAX_TOKENS_PRICED) break;
  }
  const candidateTokens = Array.from(uniqueTokens.values());

  const balances = await mapWithConcurrency(candidateTokens, 2, t => fetchTokenBalance(t, walletAddress, chainId, apiKey));
  const failedLookups = balances.filter(t => t.lookupFailed);
  const heldTokens = balances.filter(t => !t.lookupFailed && t.amount > 0);

  if (heldTokens.length === 0 && !nativeAmount) {
    return null;
  }

  // Sequential (concurrency 1), not parallel — CoinGecko's free tier
  // rate-limits noticeably faster than Etherscan's. Bailing out mid-loop on
  // the deadline still returns every token balance already fetched, just
  // without a price for the ones we didn't get to.
  const priced: Array<(typeof heldTokens)[number] & { price: number | null; rateLimited: boolean }> = [];
  let timedOutWhilePricing = false;
  for (const t of heldTokens) {
    if (Date.now() > deadline) {
      timedOutWhilePricing = true;
      break;
    }
    const result = await fetchTokenPrice(t.contractAddress, chain);
    priced.push({ ...t, ...result });
  }
  const unpriced = heldTokens.slice(priced.length);

  const tokens = [
    ...priced.map(t => ({
      name: t.tokenName,
      symbol: t.tokenSymbol,
      contractAddress: t.contractAddress,
      amount: t.amount,
      usdPrice: t.price,
      usdValue: t.price !== null ? t.price * t.amount : null,
      priceUnavailableReason: (t.price !== null ? null : t.rateLimited ? 'rate-limited' : 'no-market-data') as
        | 'rate-limited'
        | 'no-market-data'
        | null,
    })),
    ...unpriced.map(t => ({
      name: t.tokenName,
      symbol: t.tokenSymbol,
      contractAddress: t.contractAddress,
      amount: t.amount,
      usdPrice: null,
      usdValue: null,
      priceUnavailableReason: 'not-priced-time-budget' as const,
    })),
  ];

  const rateLimitedTokens = priced.filter(t => t.rateLimited);
  const knownTotalUsd = (native.usdValue ?? 0) + tokens.reduce((sum, t) => sum + (t.usdValue ?? 0), 0);

  const notes = [
    candidateTokens.length >= MAX_TOKENS_PRICED
      ? `Limited to the ${MAX_TOKENS_PRICED} most recently-active token contracts on ${chain}; wallet may hold more there.`
      : null,
    failedLookups.length > 0
      ? `Balance lookup failed (after retry) for ${failedLookups.length} token(s) on ${chain}: ${failedLookups.map(t => t.tokenSymbol).join(', ')} — current balance unknown, not necessarily zero.`
      : null,
    rateLimitedTokens.length > 0
      ? `Price lookup was rate-limited by CoinGecko for ${rateLimitedTokens.length} token(s) on ${chain}: ${rateLimitedTokens.map(t => t.tokenSymbol).join(', ')} — their real price may exist but couldn't be confirmed this run.`
      : null,
    timedOutWhilePricing
      ? `Time budget reached while pricing ${chain} tokens; ${unpriced.length} token balance(s) known but not priced this run.`
      : null,
  ].filter(Boolean);

  return { chain, native, tokens, totalUsdValueOfPricedHoldings: knownTotalUsd, note: notes.join(' ') };
}

/**
 * Live source: Etherscan's unified V2 API (native balance + ERC-20 transfer
 * history + per-token balance lookups) combined with CoinGecko for USD
 * pricing. Both are already used elsewhere in this project.
 *
 * By default this checks EVERY chain in SUPPORTED_CHAINS (a wallet's
 * holdings aren't confined to one chain), not just Ethereum — pass `chain`
 * only to narrow to a single chain the user explicitly named. Chains are
 * checked with bounded concurrency (CHAIN_CONCURRENCY) to stay within
 * Etherscan/CoinGecko free-tier rate limits, and a chain is skipped from the
 * output entirely once its cheap activity check (native balance + transfer
 * history) comes back empty — the expensive per-token balance/pricing work
 * only runs for chains that actually show activity.
 *
 * Etherscan's single-call "all token balances for an address" endpoint
 * (addresstokenbalance) is Pro-only, so per chain this instead: (1) pulls
 * recent ERC-20 transfer history to discover which token contracts this
 * wallet has touched, (2) checks the CURRENT balance of each discovered
 * contract individually (capped at the most recent MAX_TOKENS_PRICED
 * contracts per chain to bound request count/latency), (3) prices
 * everything via CoinGecko.
 *
 * Known limitations, surfaced in the response rather than hidden:
 *  - Only tokens with at least one Transfer-event history are discoverable
 *    this way; some non-standard tokens may be missed.
 *  - Capped at the most recent MAX_TOKENS_PRICED distinct contracts per chain.
 *  - CoinGecko doesn't have USD prices for every token; those show as
 *    usdValue: null rather than a fabricated number.
 *  - Bounded by TIME_BUDGET_MS wall-clock time: a wallet very active on many
 *    chains may hit the budget before every chain (or every token on a
 *    chain) is checked. chainsSkippedDueToTimeBudget lists chains never
 *    even started — explicitly "unknown", never conflated with "checked and
 *    empty". A chain that ran out of time partway through still reports its
 *    native balance; unpriced/unchecked tokens show up with
 *    priceUnavailableReason: "not-priced-time-budget" or are called out in
 *    that chain's `note`.
 */
export const walletHoldingsTool = tool({
  description:
    "Look up a wallet's current token holdings (native coin + ERC-20 tokens) across ALL supported chains by default, with names, amounts, and USD values. Pass `chain` only to narrow to a single chain the user explicitly named.",
  inputSchema: z.object({
    walletAddress: z.string(),
    chain: z.enum(SUPPORTED_CHAINS).optional(),
  }),
  execute: async ({ walletAddress, chain }) => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return {
        error: `"${walletAddress}" doesn't look like a valid wallet address (expected 0x followed by 40 hex characters).`,
      };
    }

    const apiKey = process.env.ETHERSCAN_API_KEY;
    if (!apiKey) {
      return {
        source: 'stub-no-live-data',
        note: 'ETHERSCAN_API_KEY is not set. Add it to .env.local (free key at https://etherscan.io/apis) to enable wallet holdings lookups.',
      };
    }

    try {
      const deadline = Date.now() + TIME_BUDGET_MS;
      const chainsToCheck: Chain[] = chain ? [chain] : [...SUPPORTED_CHAINS];
      const results = await mapWithConcurrency(chainsToCheck, CHAIN_CONCURRENCY, c =>
        checkChainHoldings(walletAddress, c, apiKey, deadline),
      );

      const holdings = results.filter((r): r is ChainHoldings => r !== null && r !== 'skipped');
      const chainsSkippedDueToTimeBudget = chainsToCheck.filter((_, i) => results[i] === 'skipped');
      const grandTotalUsd = holdings.reduce((sum, h) => sum + h.totalUsdValueOfPricedHoldings, 0);

      const noteParts = [
        chain
          ? null
          : `Checked ${chainsToCheck.length - chainsSkippedDueToTimeBudget.length} of ${chainsToCheck.length} supported chains within the time budget; holdings found on ${holdings.length}${
              holdings.length > 0 ? ` (${holdings.map(h => h.chain).join(', ')})` : ''
            }.`,
        chainsSkippedDueToTimeBudget.length > 0
          ? `${chainsSkippedDueToTimeBudget.length} chain(s) not checked at all due to the time budget — this is NOT the same as "no holdings", it means unknown: ${chainsSkippedDueToTimeBudget.join(', ')}.`
          : null,
        holdings.length === 0 && chainsSkippedDueToTimeBudget.length === 0
          ? chain
            ? `No native or ERC-20 holdings found for this wallet on ${chain}.`
            : 'No native or ERC-20 holdings found for this wallet on any chain checked.'
          : null,
      ].filter(Boolean);

      return {
        source: 'etherscan-v2 + coingecko',
        chainsChecked: chainsToCheck.length,
        chainsSkippedDueToTimeBudget,
        holdings,
        totalUsdValueOfPricedHoldings: grandTotalUsd,
        note: noteParts.join(' '),
      };
    } catch (err) {
      return {
        error: `Wallet holdings lookup failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
});
