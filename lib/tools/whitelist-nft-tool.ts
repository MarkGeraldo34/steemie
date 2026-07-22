import { tool } from 'ai';
import { z } from 'zod';

type CoinGeckoTrendingNft = {
  name: string;
  symbol: string;
  native_currency_symbol: string;
  floor_price_in_native_currency: number;
  floor_price_24h_percentage_change: number;
};

/**
 * Partial live source: CoinGecko's /search/trending endpoint includes
 * trending NFT collections by market activity (floor price, volume). That's
 * a real signal for "which collections have elevated attention right now",
 * but it is NOT whitelist-deadline or mint-date data — CoinGecko doesn't
 * track that. Whitelist spots live in project Discords/socials with no
 * public API, so `whitelistDeadline`/`mintDate`/`mintPrice` stay stubbed
 * until that's wired to a real source (e.g. a Discord scraper).
 */
export const whitelistNftTool = tool({
  description:
    'Look up NFT collections currently trending by market activity, and (once wired up) upcoming whitelist/mint opportunities.',
  inputSchema: z.object({
    query: z.string().optional().describe('Collection name or keyword to filter by'),
  }),
  execute: async ({ query }) => {
    let trendingCollections: Array<{
      name: string;
      floorPrice: string;
      floorPrice24hChangePct: number;
    }> = [];
    let trendingError: string | null = null;

    try {
      const res = await fetch('https://api.coingecko.com/api/v3/search/trending', {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = (await res.json()) as { nfts: CoinGeckoTrendingNft[] };
        trendingCollections = data.nfts
          .filter(n => !query || n.name.toLowerCase().includes(query.toLowerCase()))
          .map(n => ({
            name: `${n.name} (${n.symbol})`,
            floorPrice: `${n.floor_price_in_native_currency} ${n.native_currency_symbol.toUpperCase()}`,
            floorPrice24hChangePct: n.floor_price_24h_percentage_change,
          }));
      } else {
        trendingError = `CoinGecko returned ${res.status}`;
      }
    } catch (err) {
      trendingError = `Failed to fetch trending NFTs: ${err instanceof Error ? err.message : String(err)}`;
    }

    return {
      trendingCollections: {
        source: 'coingecko-trending-nfts',
        note: 'Real-time trending-by-market-activity, not a whitelist/mint calendar.',
        error: trendingError,
        collections: trendingCollections,
      },
      whitelistOpportunities: {
        source: 'stub-no-live-data',
        note: 'No live whitelist/mint-date feed is configured. This data lives in project Discords/socials with no public API — wiring this up requires a Discord scraper or manual feed, not a drop-in API.',
        opportunities: [] as Array<{
          collection: string;
          chain: string;
          whitelistDeadline: string;
          mintDate: string;
          mintPrice: string;
          supply: number;
          officialUrl: string;
        }>,
      },
    };
  },
});
