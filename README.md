# Steemie

A genuine tool-calling AI agent (built on the AI SDK's `ToolLoopAgent`) that
researches ongoing/upcoming crypto token sales, NFT whitelist spots, market
trends, and raffles, produces evidence-based risk analysis, and can look up
what a wallet currently holds — not a scripted "auto-buy" bot dressed up as AI.

## How it's actually agentic

Unlike a rules engine or a single LLM call, the model itself:

- decides which tools to call and in what order (up to 20 steps),
- can chain a listing lookup into a `riskAnalysis` due-diligence call for a
  specific opportunity,
- cross-references results before concluding anything,
- and refuses to fabricate data when a tool has no live source.

See [`lib/agents/crypto-intel-agent.ts`](lib/agents/crypto-intel-agent.ts) for
the instructions and tool wiring.

## Current status of each tool

- `lib/tools/trends-tool.ts` — **live** (CoinGecko trending coins/categories, no key needed)
- `lib/tools/whitelist-nft-tool.ts` — **partially live** (CoinGecko trending NFT
  collections by market activity); whitelist deadlines/mint dates are still
  stubbed — that data only exists in project Discords/socials with no public API
- `lib/tools/risk-analysis-tool.ts` — **partially live** (Etherscan contract
  verification, requires `ETHERSCAN_API_KEY`); audit status, liquidity lock,
  holder concentration, deployer history, team doxx, and social authenticity
  are still stubbed — no free API exists for those
- `lib/tools/wallet-holdings-tool.ts` — **live** (Etherscan native balance +
  ERC-20 transfer-history discovery + per-token balance + CoinGecko USD
  pricing, requires `ETHERSCAN_API_KEY`). Capped to the 15 most-recently-active
  token contracts per wallet; tokens without a CoinGecko price show as
  `usdValue: null` rather than a guessed number
- `lib/tools/token-sales-tool.ts` — **stubbed**, no free/keyless live source
  exists (DeFiLlama `/raises` is now paywalled; no free ICO calendar API)
- `lib/tools/raffles-tool.ts` — **stubbed**, no free/keyless live source exists
  (raffle listings live in Discord/X, not a public API)

Every stubbed tool returns `source: "stub-no-live-data"` explicitly, and the
agent is instructed to say so rather than invent sales, prices, audits, or
social metrics.

## Running locally

```bash
npm install
cp .env.local.example .env.local
# add AI_GATEWAY_API_KEY (https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys)
# add ETHERSCAN_API_KEY (free, https://etherscan.io/apis) to enable risk-analysis + wallet-holdings
npm run dev
```

## Production

Live at https://steemie.vercel.app (Vercel project `capitalbridge/steemie`).

## Compliance note

The agent gives "should I join this sale/mint" style analysis. Depending on
your jurisdiction and whether this is offered publicly/for pay, that can
brush up against investment-adviser regulation independent of the AI angle —
worth a legal review before shipping this as a real product, separate from
the technical build.
