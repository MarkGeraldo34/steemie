import { tool } from 'ai';
import { z } from 'zod';
import {
  SUPPORTED_CHAINS,
  ETHERSCAN_CHAIN_IDS,
  COINGECKO_PLATFORM_IDS,
  NATIVE_COINGECKO_IDS,
  NATIVE_SYMBOLS,
} from '../chains';

const MAX_TOKENS_PRICED = 15;

type EtherscanTokenTx = {
  contractAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
};

async function etherscanCall(params: Record<string, string>, apiKey: string) {
  const url = new URL('https://api.etherscan.io/v2/api');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('apikey', apiKey);
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  return (await res.json()) as { status: string; message: string; result: unknown };
}

// Runs async jobs with a concurrency cap so we don't burst past Etherscan's
// free-tier rate limit (3 req/sec, confirmed by testing) when checking many
// token balances at once.
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

/**
 * Live source: Etherscan's unified V2 API (native balance + ERC-20 transfer
 * history + per-token balance lookups) combined with CoinGecko for USD
 * pricing. Both are already used elsewhere in this project.
 *
 * Etherscan's single-call "all token balances for an address" endpoint
 * (addresstokenbalance) is Pro-only, so this instead: (1) pulls recent
 * ERC-20 transfer history to discover which token contracts this wallet has
 * touched, (2) checks the CURRENT balance of each discovered contract
 * individually (capped at the most recent MAX_TOKENS_PRICED contracts to
 * bound request count/latency), (3) prices everything via CoinGecko.
 *
 * Known limitations, surfaced in the response rather than hidden:
 *  - Only tokens with at least one Transfer-event history are discoverable
 *    this way; some non-standard tokens may be missed.
 *  - Capped at the most recent MAX_TOKENS_PRICED distinct contracts.
 *  - CoinGecko doesn't have USD prices for every token; those show as
 *    usdValue: null rather than a fabricated number.
 */
export const walletHoldingsTool = tool({
  description:
    "Look up a wallet's current token holdings (native coin + ERC-20 tokens) with names, amounts, and USD values.",
  inputSchema: z.object({
    walletAddress: z.string(),
    chain: z.enum(SUPPORTED_CHAINS).default('ethereum'),
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

    const chainId = String(ETHERSCAN_CHAIN_IDS[chain]);

    try {
      const [nativeBalRes, tokenTxRes, nativePriceRes] = await Promise.all([
        etherscanCall({ chainid: chainId, module: 'account', action: 'balance', address: walletAddress, tag: 'latest' }, apiKey),
        etherscanCall(
          { chainid: chainId, module: 'account', action: 'tokentx', address: walletAddress, page: '1', offset: '200', sort: 'desc' },
          apiKey,
        ),
        fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${NATIVE_COINGECKO_IDS[chain]}&vs_currencies=usd`,
        ).then(r => (r.ok ? r.json() : null)),
      ]);

      const nativeSymbol = NATIVE_SYMBOLS[chain];
      const nativeAmount =
        nativeBalRes.status === '1' ? Number(nativeBalRes.result as string) / 1e18 : null;
      const nativePriceUsd = nativePriceRes?.[NATIVE_COINGECKO_IDS[chain]]?.usd ?? null;

      const native = {
        symbol: nativeSymbol,
        amount: nativeAmount,
        usdPrice: nativePriceUsd,
        usdValue: nativeAmount !== null && nativePriceUsd !== null ? nativeAmount * nativePriceUsd : null,
      };

      if (tokenTxRes.status !== '1' || !Array.isArray(tokenTxRes.result)) {
        return {
          native,
          tokens: [] as unknown[],
          note: 'No ERC-20 transfer history found (or Etherscan returned an error) — this wallet may hold no ERC-20 tokens on this chain, or may only hold tokens with no transfer-event history.',
        };
      }

      const transfers = tokenTxRes.result as EtherscanTokenTx[];
      const uniqueTokens = new Map<string, EtherscanTokenTx>();
      for (const t of transfers) {
        if (!uniqueTokens.has(t.contractAddress)) uniqueTokens.set(t.contractAddress, t);
        if (uniqueTokens.size >= MAX_TOKENS_PRICED) break;
      }
      const candidateTokens = Array.from(uniqueTokens.values());

      const balances = await mapWithConcurrency(candidateTokens, 2, t =>
        fetchTokenBalance(t, walletAddress, chainId, apiKey),
      );

      const failedLookups = balances.filter(t => t.lookupFailed);
      const heldTokens = balances.filter(t => !t.lookupFailed && t.amount > 0);

      let prices: Record<string, { usd?: number }> = {};
      if (heldTokens.length > 0) {
        const addresses = heldTokens.map(t => t.contractAddress).join(',');
        const priceRes = await fetch(
          `https://api.coingecko.com/api/v3/simple/token_price/${COINGECKO_PLATFORM_IDS[chain]}?contract_addresses=${addresses}&vs_currencies=usd`,
        );
        if (priceRes.ok) prices = await priceRes.json();
      }

      const tokens = heldTokens.map(t => {
        const price = prices[t.contractAddress.toLowerCase()]?.usd ?? null;
        return {
          name: t.tokenName,
          symbol: t.tokenSymbol,
          contractAddress: t.contractAddress,
          amount: t.amount,
          usdPrice: price,
          usdValue: price !== null ? price * t.amount : null,
        };
      });

      const knownTotalUsd =
        (native.usdValue ?? 0) + tokens.reduce((sum, t) => sum + (t.usdValue ?? 0), 0);

      const notes = [
        candidateTokens.length >= MAX_TOKENS_PRICED
          ? `Limited to the ${MAX_TOKENS_PRICED} most recently-active token contracts; wallet may hold more.`
          : null,
        'Tokens without a CoinGecko price show usdValue: null rather than a guessed number.',
        failedLookups.length > 0
          ? `Balance lookup failed (after retry) for ${failedLookups.length} token(s): ${failedLookups.map(t => t.tokenSymbol).join(', ')} — their current balance is unknown, not necessarily zero.`
          : null,
      ].filter(Boolean);

      return {
        source: 'etherscan-v2 + coingecko',
        chain,
        native,
        tokens,
        totalUsdValueOfPricedHoldings: knownTotalUsd,
        note: notes.join(' '),
      };
    } catch (err) {
      return {
        error: `Wallet holdings lookup failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
});
