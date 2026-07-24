import { tool } from 'ai';
import { z } from 'zod';
import { fetchRecentTweets, type XTweet } from '../twitter-api';

/**
 * Live source (X API v2): recent original tweets (retweets/replies
 * excluded) via GET /2/users/:id/tweets. Requires X_API_BEARER_TOKEN.
 */
export const twitterTweetsTool = tool({
  description:
    "Fetch a Twitter/X user's recent original tweets (excludes retweets and replies). Use when the user asks to see or search someone's tweets/posts.",
  inputSchema: z.object({
    handle: z.string().describe('Twitter/X username, with or without the leading @'),
    count: z.number().int().min(5).max(50).default(10).describe('How many recent tweets to fetch (5-50)'),
  }),
  execute: async ({ handle, count }) => {
    const username = handle.replace(/^@/, '');
    const result = await fetchRecentTweets(username, count);

    if (!result.ok) {
      return {
        handle: username,
        source: result.status === 'no-token' ? 'stub-no-live-data' : 'x-api',
        note: result.message,
        tweets: [] as XTweet[],
      };
    }

    return {
      handle: username,
      source: 'x-api',
      note:
        result.tweets.length === 0
          ? 'No original tweets found — the account may only retweet/reply, or has no public tweets.'
          : `${result.tweets.length} most recent original tweets (retweets and replies excluded).`,
      tweets: result.tweets,
    };
  },
});
