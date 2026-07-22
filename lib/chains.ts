export const SUPPORTED_CHAINS = [
  'ethereum',
  'bsc',
  'polygon',
  'arbitrum',
  'base',
  'optimism',
  'avalanche',
] as const;

export type Chain = (typeof SUPPORTED_CHAINS)[number];

export const ETHERSCAN_CHAIN_IDS: Record<Chain, number> = {
  ethereum: 1,
  bsc: 56,
  polygon: 137,
  arbitrum: 42161,
  base: 8453,
  optimism: 10,
  avalanche: 43114,
};

// CoinGecko "asset platform" ids, for the /simple/token_price/{platform} endpoint.
export const COINGECKO_PLATFORM_IDS: Record<Chain, string> = {
  ethereum: 'ethereum',
  bsc: 'binance-smart-chain',
  polygon: 'polygon-pos',
  arbitrum: 'arbitrum-one',
  base: 'base',
  optimism: 'optimistic-ethereum',
  avalanche: 'avalanche',
};

// CoinGecko coin ids for each chain's native gas token (L2s settle in ETH).
export const NATIVE_COINGECKO_IDS: Record<Chain, string> = {
  ethereum: 'ethereum',
  bsc: 'binancecoin',
  polygon: 'polygon-ecosystem-token',
  arbitrum: 'ethereum',
  base: 'ethereum',
  optimism: 'ethereum',
  avalanche: 'avalanche-2',
};

export const NATIVE_SYMBOLS: Record<Chain, string> = {
  ethereum: 'ETH',
  bsc: 'BNB',
  polygon: 'POL',
  arbitrum: 'ETH',
  base: 'ETH',
  optimism: 'ETH',
  avalanche: 'AVAX',
};
