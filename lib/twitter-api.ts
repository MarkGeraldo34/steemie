/**
 * Shared X API v2 helpers: resolve a handle to a user id, then fetch that
 * user's recent original tweets (retweets/replies excluded). Used by both
 * twitter-tweets-tool.ts and twitter-personality-tool.ts so the fetch +
 * error-handling logic lives in one place.
 */

const X_API_BASE = 'https://api.x.com/2';

export type XTweet = {
  id: string;
  text: string;
  createdAt: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  impressionCount: number;
};

export type FetchTweetsResult =
  | { ok: true; tweets: XTweet[] }
  | { ok: false; status: 'no-token' | 'not-found' | 'error'; message: string };

export async function fetchRecentTweets(username: string, maxResults: number): Promise<FetchTweetsResult> {
  const bearerToken = process.env.X_API_BEARER_TOKEN;
  if (!bearerToken) {
    return {
      ok: false,
      status: 'no-token',
      message:
        'X_API_BEARER_TOKEN is not set. Add it to .env.local to enable live tweet lookups.',
    };
  }

  try {
    const userRes = await fetch(`${X_API_BASE}/users/by/username/${encodeURIComponent(username)}`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });

    if (userRes.status === 404) {
      return { ok: false, status: 'not-found', message: 'No X/Twitter account exists for this handle.' };
    }
    if (!userRes.ok) {
      return { ok: false, status: 'error', message: `User lookup failed: HTTP ${userRes.status}` };
    }

    const userData = (await userRes.json()) as { data: { id: string } };
    const userId = userData.data.id;

    // X API requires max_results between 5 and 100.
    const clamped = Math.min(Math.max(maxResults, 5), 100);

    const tweetsRes = await fetch(
      `${X_API_BASE}/users/${userId}/tweets?max_results=${clamped}&exclude=retweets,replies&tweet.fields=created_at,public_metrics`,
      { headers: { Authorization: `Bearer ${bearerToken}` } },
    );

    if (!tweetsRes.ok) {
      return { ok: false, status: 'error', message: `Tweet lookup failed: HTTP ${tweetsRes.status}` };
    }

    const tweetsData = (await tweetsRes.json()) as {
      data?: Array<{
        id: string;
        text: string;
        created_at: string;
        public_metrics: {
          like_count: number;
          retweet_count: number;
          reply_count: number;
          quote_count: number;
          impression_count: number;
        };
      }>;
    };

    const tweets: XTweet[] = (tweetsData.data ?? []).map(t => ({
      id: t.id,
      text: t.text,
      createdAt: t.created_at,
      likeCount: t.public_metrics.like_count,
      retweetCount: t.public_metrics.retweet_count,
      replyCount: t.public_metrics.reply_count,
      quoteCount: t.public_metrics.quote_count,
      impressionCount: t.public_metrics.impression_count,
    }));

    return { ok: true, tweets };
  } catch (err) {
    return { ok: false, status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
