import { tool } from 'ai';
import { z } from 'zod';

type CoinGeckoTrendingResponse = {
  coins: Array<{
    item: {
      id: string;
      name: string;
      symbol: string;
      market_cap_rank: number | null;
      score: number;
      data?: { price_change_percentage_24h?: Record<string, number> };
    };
  }>;
  categories: Array<{
    name: string;
    market_cap_1h_change: number;
    coins_count: string;
  }>;
};

/**
 * Live source: CoinGecko's public /search/trending endpoint (no API key
 * required). Reflects what's getting search/attention volume on CoinGecko
 * right now, which is a reasonable proxy for "meta" but is NOT the same as
 * fundamentals — a coin can trend from hype or manipulation as easily as
 * from real adoption. The agent is instructed to treat this as a signal to
 * investigate further, not a verdict.
 */
export const trendsTool = tool({
  description:
    'Get currently trending crypto coins and category "meta" narratives from CoinGecko search-trending data.',
  inputSchema: z.object({
    category: z
      .string()
      .optional()
      .describe('Narrow to a category name substring, e.g. "AI", "meme"'),
  }),
  execute: async ({ category }) => {
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/search/trending', {
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        return {
          source: 'coingecko-trending',
          error: `CoinGecko returned ${res.status}`,
          trends: [] as unknown[],
        };
      }

      const data = (await res.json()) as CoinGeckoTrendingResponse;

      const coinTrends = data.coins.map(({ item }) => ({
        type: 'coin' as const,
        name: `${item.name} (${item.symbol.toUpperCase()})`,
        marketCapRank: item.market_cap_rank,
        trendingScoreRank: item.score + 1,
        priceChange24hPct: item.data?.price_change_percentage_24h?.usd ?? null,
      }));

      const categoryTrends = data.categories
        .filter(c => !category || c.name.toLowerCase().includes(category.toLowerCase()))
        .map(c => ({
          type: 'category' as const,
          name: c.name,
          coinsCount: Number(c.coins_count),
          marketCap1hChangePct: c.market_cap_1h_change,
        }));

      const filteredCoins = category
        ? coinTrends.filter(c => c.name.toLowerCase().includes(category.toLowerCase()))
        : coinTrends;

      return {
        source: 'coingecko-trending',
        note: 'Reflects current search/attention volume on CoinGecko, not fundamentals. High trend rank is a signal to investigate, not a buy signal.',
        trendingCoins: filteredCoins,
        trendingCategories: categoryTrends,
      };
    } catch (err) {
      return {
        source: 'coingecko-trending',
        error: `Failed to fetch trending data: ${err instanceof Error ? err.message : String(err)}`,
        trends: [] as unknown[],
      };
    }
  },
});
