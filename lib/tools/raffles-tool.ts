import { tool } from 'ai';
import { z } from 'zod';
import { searchRecentTweets } from '../twitter-api';
import { resolveProjectHandlesAndSort, type ProjectHandle } from '../ethos-api';

const KEYWORDS = '(raffle OR giveaway OR "WL raffle") (NFT OR whitelist OR crypto OR mint) -is:retweet -is:reply lang:en';

/**
 * Live source (X API v2 recent search, last 7 days only): searches public
 * tweets for raffle/giveaway keywords. Requires X_API_BEARER_TOKEN.
 *
 * These are unverified leads scraped from public posts, not a vetted
 * calendar — raffle/giveaway posts are a common scam vector (fake prizes,
 * phishing links, wallet-drainer sites). Only leads that actually @mention a
 * project/team account are kept (whoever merely posted about it is dropped
 * entirely — see ethos-api.ts's resolveProjectHandlesAndSort), and the list
 * is sorted by engagement (likes + retweets) — highest-interaction leads
 * about the topic surface first.
 */
export const rafflesTool = tool({
  description:
    'Search recent public tweets (last 7 days) for ongoing crypto/NFT raffles and giveaways. Returns unverified leads, not a vetted calendar — cross-check the project account before treating any result as legitimate.',
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
          postedAt: string;
          url: string;
          engagement: { likes: number; retweets: number };
          projectHandle: ProjectHandle;
        }>,
      };
    }

    const rawRaffles = result.tweets.map(t => ({
      text: t.text,
      postedBy: t.authorUsername,
      postedAt: t.createdAt,
      url: t.url,
      engagement: { likes: t.likeCount, retweets: t.retweetCount },
      mentionedUsernames: t.mentionedUsernames,
    }));
    const raffles = await resolveProjectHandlesAndSort(rawRaffles);

    return {
      source: 'x-api-search',
      note:
        raffles.length === 0
          ? 'No matching raffle/giveaway leads with an identifiable project/team account found in the last 7 days.'
          : `${raffles.length} recent public tweets mentioning raffles/giveaways (last 7 days, search window only — not exhaustive), each naming a project/team account, sorted by engagement (likes + retweets, highest first). These are UNVERIFIED leads, not a vetted calendar; raffle scams (fake prizes, phishing/drainer links) are common — a decent Ethos score is not a safety guarantee.`,
      filtersApplied: { query: query ?? null },
      raffles,
    };
  },
});
