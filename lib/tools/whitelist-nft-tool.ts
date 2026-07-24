import { tool } from 'ai';
import { z } from 'zod';
import { searchRecentTweets } from '../twitter-api';
import { attachEthosScoresAndSort, type EthosLevel } from '../ethos-api';

type CoinGeckoTrendingNft = {
  name: string;
  symbol: string;
  native_currency_symbol: string;
  floor_price_in_native_currency: number;
  floor_price_24h_percentage_change: number;
};

const KEYWORDS =
  '(whitelist OR "WL spot" OR mintlist OR "free mint") (NFT OR mint OR collection) -is:retweet -is:reply lang:en';

/**
 * Two live sources:
 *  - CoinGecko's /search/trending: trending NFT collections by market
 *    activity (floor price, volume) — a real signal, but not whitelist/mint
 *    dates.
 *  - X API v2 recent search (last 7 days): public tweets announcing
 *    whitelist spots / free mints. These are unverified leads scraped from
 *    posts, not a vetted whitelist calendar — the exact deadline/mint
 *    date/price live in the tweet text itself (if stated at all) and must
 *    be read by the agent, not parsed here.
 */
export const whitelistNftTool = tool({
  description:
    'Look up NFT collections currently trending by market activity, and recent public tweets announcing whitelist spots / free mints (last 7 days, unverified leads).',
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

    const fullQuery = query ? `${KEYWORDS} ${query}` : KEYWORDS;
    const searchResult = await searchRecentTweets(fullQuery, 10);

    const whitelistLeads: {
      source: string;
      note: string;
      leads: Array<{
        text: string;
        postedBy: string;
        postedByProfileUrl: string;
        postedAt: string;
        url: string;
        engagement: { likes: number; retweets: number };
        ethosScore: number | null;
        ethosLevel: EthosLevel | null;
      }>;
    } = { source: 'x-api-search', note: '', leads: [] };

    if (!searchResult.ok) {
      whitelistLeads.source = searchResult.status === 'no-token' ? 'stub-no-live-data' : 'x-api-search';
      whitelistLeads.note = searchResult.message;
    } else {
      const rawLeads = searchResult.tweets.map(t => ({
        text: t.text,
        postedBy: t.authorUsername,
        postedByProfileUrl: t.profileUrl,
        postedAt: t.createdAt,
        url: t.url,
        engagement: { likes: t.likeCount, retweets: t.retweetCount },
      }));
      whitelistLeads.leads = await attachEthosScoresAndSort(rawLeads);
      whitelistLeads.note =
        whitelistLeads.leads.length === 0
          ? 'No matching whitelist/mint tweets found in the last 7 days.'
          : `${whitelistLeads.leads.length} recent public tweets announcing whitelist spots/mints (last 7 days, search window only — not exhaustive), sorted by Ethos score (highest/most-vetted first, unrated last). UNVERIFIED leads, not a vetted calendar — a decent Ethos score is not a safety guarantee. Deadline/mint date/price, if stated, are in the tweet text itself — read them yourself rather than assuming structure.`;
    }

    return {
      trendingCollections: {
        source: 'coingecko-trending-nfts',
        note: 'Real-time trending-by-market-activity, not a whitelist/mint calendar.',
        error: trendingError,
        collections: trendingCollections,
      },
      whitelistLeads,
    };
  },
});
