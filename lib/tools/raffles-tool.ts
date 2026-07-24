import { tool } from 'ai';
import { z } from 'zod';
import { searchRecentTweets } from '../twitter-api';

const KEYWORDS = '(raffle OR giveaway OR "WL raffle") (NFT OR whitelist OR crypto OR mint) -is:retweet -is:reply lang:en';

/**
 * Live source (X API v2 recent search, last 7 days only): searches public
 * tweets for raffle/giveaway keywords. Requires X_API_BEARER_TOKEN.
 *
 * These are unverified leads scraped from public posts, not a vetted
 * calendar — raffle/giveaway posts are a common scam vector (fake prizes,
 * phishing links, wallet-drainer sites). The tool does not judge legitimacy;
 * it returns raw candidates for the agent to present with that caveat and
 * cross-check via twitterGenuineness.
 */
export const rafflesTool = tool({
  description:
    'Search recent public tweets (last 7 days) for ongoing crypto/NFT raffles and giveaways. Returns unverified leads, not a vetted calendar — cross-check the poster before treating any result as legitimate.',
  inputSchema: z.object({
    query: z.string().optional().describe('Project or keyword to filter by'),
  }),
  execute: async ({ query }) => {
    const fullQuery = query ? `${KEYWORDS} ${query}` : KEYWORDS;
    const result = await searchRecentTweets(fullQuery, 10);

    if (!result.ok) {
      return {
        source: result.status === 'no-token' ? 'stub-no-live-data' : 'x-api-search',
        note: result.message,
        filtersApplied: { query: query ?? null },
        raffles: [] as Array<{
          text: string;
          postedBy: string;
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
          ? 'No matching raffle/giveaway tweets found in the last 7 days.'
          : `${result.tweets.length} recent public tweets mentioning raffles/giveaways (last 7 days, search window only — not exhaustive). These are UNVERIFIED leads, not a vetted calendar; raffle scams (fake prizes, phishing/drainer links) are common. Check the poster via twitterGenuineness before presenting any as a real opportunity.`,
      filtersApplied: { query: query ?? null },
      raffles: result.tweets.map(t => ({
        text: t.text,
        postedBy: t.authorUsername,
        postedAt: t.createdAt,
        url: t.url,
        engagement: { likes: t.likeCount, retweets: t.retweetCount },
      })),
    };
  },
});
