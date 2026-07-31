import { tool } from 'ai';
import { z } from 'zod';
import { searchRecentTweets } from '../twitter-api';

/**
 * Live source (X API v2 recent search, last 7 days only): searches public
 * tweets mentioning a crypto topic/coin/project and returns them as raw
 * evidence — text, author, engagement — for the agent to read and
 * characterize. Same "tool = evidence, agent = synthesis" pattern as
 * twitterPersonality: there is no sentiment-scoring API wired in (and none
 * is needed), reading text for bullish/bearish tone is exactly what an LLM
 * already does well.
 *
 * No separate news-article API is wired in — this only covers X/Twitter
 * (including tweets that themselves link out to articles), matching every
 * other live source in this codebase (see twitter-api.ts).
 */
export const twitterSentimentTool = tool({
  description:
    'Search recent public tweets (last 7 days) about a crypto topic, coin, or project and return them as raw evidence for a sentiment read (bullish/bearish/mixed/neutral, recurring themes). Does not compute sentiment itself — the agent reads the returned text and characterizes it.',
  inputSchema: z.object({
    topic: z
      .string()
      .describe('Crypto coin, project, ticker, or narrative to gauge sentiment on, e.g. "Solana", "$SOL", "restaking"'),
    count: z.number().int().min(10).max(100).default(30).describe('How many recent tweets to sample (10-100)'),
  }),
  execute: async ({ topic, count }) => {
    const fullQuery = `${topic} -is:retweet -is:reply lang:en`;
    const result = await searchRecentTweets(fullQuery, count);

    if (!result.ok) {
      return {
        topic,
        source: result.status === 'no-token' ? 'stub-no-live-data' : 'x-api-search',
        note: result.message,
        tweets: [] as Array<{
          text: string;
          authorUsername: string;
          profileUrl: string;
          url: string;
          createdAt: string;
          engagement: { likes: number; retweets: number; replies: number };
        }>,
      };
    }

    return {
      topic,
      source: 'x-api-search',
      note:
        result.tweets.length === 0
          ? `No public tweets about "${topic}" found in the last 7 days — say so rather than inventing a sentiment read.`
          : `${result.tweets.length} recent public tweets mentioning "${topic}" (last 7 days, search window only — a sample of public posts, not a scientific survey). Read the text yourself and characterize overall sentiment (bullish/bearish/mixed/neutral) and 2-4 recurring themes; do not extrapolate beyond what this sample supports.`,
      tweets: result.tweets.map(t => ({
        text: t.text,
        authorUsername: t.authorUsername,
        profileUrl: t.profileUrl,
        url: t.url,
        createdAt: t.createdAt,
        engagement: { likes: t.likeCount, retweets: t.retweetCount, replies: t.replyCount },
      })),
    };
  },
});
