import { tool } from 'ai';
import { z } from 'zod';
import { searchRecentTweets } from '../twitter-api';

const KEYWORDS =
  '(presale OR "public sale" OR IDO OR "token sale" OR TGE OR "fair launch") -is:retweet -is:reply lang:en';

/**
 * Live source (X API v2 recent search, last 7 days only): searches public
 * tweets for token-sale announcement keywords. These are unverified leads —
 * a tweet can state sale terms (dates, hard cap, vesting) in its own text,
 * but the tool does not parse/trust that text as structured fact; the agent
 * reads it and treats it as claims from an unverified source.
 *
 * No structured sale-calendar API exists (checked and ruled out):
 *  - DeFiLlama /raises is paywalled, and even paid it's historical funding
 *    rounds, not a live public sale calendar.
 *  - CoinGecko has no ICO/public-sale-calendar endpoint.
 *  - Real calendars (ICO Drops, CoinList, etc.) are proprietary, no public
 *    API.
 */
export const tokenSalesTool = tool({
  description:
    'Search recent public tweets (last 7 days) for ongoing/upcoming token sale announcements, optionally filtered by chain or category. Returns unverified leads — sale terms in the tweet text are unverified claims, not confirmed facts.',
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe('Project name, ticker, or category keyword to filter by'),
    chain: z.string().optional().describe('Filter by blockchain, e.g. "ethereum", "solana"'),
    saleType: z.enum(['public', 'private', 'any']).default('any'),
  }),
  execute: async ({ query, chain, saleType }) => {
    const parts = [KEYWORDS];
    if (query) parts.push(query);
    if (chain) parts.push(chain);
    const fullQuery = parts.join(' ');

    const result = await searchRecentTweets(fullQuery, 10);

    if (!result.ok) {
      return {
        source: result.status === 'no-token' ? 'stub-no-live-data' : 'x-api-search',
        note: result.message,
        filtersApplied: { query: query ?? null, chain: chain ?? null, saleType },
        sales: [] as Array<{
          text: string;
          postedBy: string;
          postedByProfileUrl: string;
          postedAt: string;
          url: string;
          engagement: { likes: number; retweets: number };
        }>,
      };
    }

    return {
      source: 'x-api-search',
      note:
        result.tweets.length === 0
          ? 'No matching token-sale tweets found in the last 7 days.'
          : `${result.tweets.length} recent public tweets mentioning token sales (last 7 days, search window only — not exhaustive; no structured sale calendar exists). UNVERIFIED leads — any dates/hard cap/vesting terms are unverified claims from the tweet text, not confirmed facts. Check the poster via twitterGenuineness before presenting any as real, and never restate sale terms as fact without that caveat.`,
      filtersApplied: { query: query ?? null, chain: chain ?? null, saleType },
      sales: result.tweets.map(t => ({
        text: t.text,
        postedBy: t.authorUsername,
        postedByProfileUrl: t.profileUrl,
        postedAt: t.createdAt,
        url: t.url,
        engagement: { likes: t.likeCount, retweets: t.retweetCount },
      })),
    };
  },
});
