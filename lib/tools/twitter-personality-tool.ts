import { tool } from 'ai';
import { z } from 'zod';
import { fetchRecentTweets } from '../twitter-api';

/**
 * Live source (X API v2): recent original tweets via GET /2/users/:id/tweets.
 * Requires X_API_BEARER_TOKEN.
 *
 * This tool does NOT compute a personality score or verdict itself — it
 * fetches raw tweet text and returns it as evidence. The agent (the LLM)
 * reads the tweets and characterizes tone/style itself, the same
 * "tool = evidence, agent = synthesis" pattern used by riskAnalysis and
 * twitterGenuineness. There is no third-party personality-scoring API
 * wired in, and none is needed — reading text for tone is exactly what an
 * LLM already does well.
 */
export const twitterPersonalityTool = tool({
  description:
    "Fetch a Twitter/X user's recent tweets specifically to analyze tone, personality, and communication style. Returns raw tweet text for you to read and characterize yourself — this tool does not score or classify personality on its own.",
  inputSchema: z.object({
    handle: z.string().describe('Twitter/X username, with or without the leading @'),
  }),
  execute: async ({ handle }) => {
    const username = handle.replace(/^@/, '');
    const result = await fetchRecentTweets(username, 25);

    if (!result.ok) {
      return {
        handle: username,
        profileUrl: `https://x.com/${username}`,
        source: result.status === 'no-token' ? 'stub-no-live-data' : 'x-api',
        note: result.message,
        tweets: [] as Array<{
          text: string;
          createdAt: string;
          engagement: { likes: number; retweets: number; replies: number };
        }>,
      };
    }

    if (result.tweets.length === 0) {
      return {
        handle: username,
        profileUrl: `https://x.com/${username}`,
        source: 'x-api',
        note: 'No original tweets found to analyze — the account may only retweet/reply, be new, or have no public tweets.',
        tweets: [],
      };
    }

    return {
      handle: username,
      profileUrl: `https://x.com/${username}`,
      source: 'x-api',
      note: `${result.tweets.length} recent original tweets to analyze. Base your read only on this text — do not assume traits beyond what it supports, and treat this as a communication-style snapshot, not a psychological profile.`,
      tweets: result.tweets.map(t => ({
        text: t.text,
        createdAt: t.createdAt,
        engagement: { likes: t.likeCount, retweets: t.retweetCount, replies: t.replyCount },
      })),
    };
  },
});
