/**
 * Shared X API v2 helpers.
 *
 * fetchRecentTweets: resolve a handle to a user id, then fetch that user's
 * recent original tweets (retweets/replies excluded). Used by
 * twitter-tweets-tool.ts and twitter-personality-tool.ts.
 *
 * searchRecentTweets: keyword search across all public tweets from the last
 * 7 days (X API's recent-search window), with author info attached. Used by
 * raffles-tool.ts, whitelist-nft-tool.ts, and token-sales-tool.ts to surface
 * candidate leads. Results are unverified public posts, not a vetted feed —
 * callers must say so and point at twitterGenuineness for poster checks.
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

export type XSearchTweet = XTweet & {
  authorUsername: string;
  authorName: string;
  url: string;
};

export type SearchTweetsResult =
  | { ok: true; tweets: XSearchTweet[] }
  | { ok: false; status: 'no-token' | 'error'; message: string };

export async function searchRecentTweets(query: string, maxResults: number): Promise<SearchTweetsResult> {
  const bearerToken = process.env.X_API_BEARER_TOKEN;
  if (!bearerToken) {
    return {
      ok: false,
      status: 'no-token',
      message: 'X_API_BEARER_TOKEN is not set. Add it to .env.local to enable live Twitter search.',
    };
  }

  try {
    // X API recent-search requires max_results between 10 and 100.
    const clamped = Math.min(Math.max(maxResults, 10), 100);

    const url = new URL(`${X_API_BASE}/tweets/search/recent`);
    url.searchParams.set('query', query);
    url.searchParams.set('max_results', String(clamped));
    url.searchParams.set('tweet.fields', 'created_at,public_metrics,author_id');
    url.searchParams.set('expansions', 'author_id');
    url.searchParams.set('user.fields', 'username,name');

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${bearerToken}` } });

    if (!res.ok) {
      return { ok: false, status: 'error', message: `Twitter search failed: HTTP ${res.status}` };
    }

    const data = (await res.json()) as {
      data?: Array<{
        id: string;
        text: string;
        created_at: string;
        author_id: string;
        public_metrics: {
          like_count: number;
          retweet_count: number;
          reply_count: number;
          quote_count: number;
          impression_count: number;
        };
      }>;
      includes?: { users?: Array<{ id: string; username: string; name: string }> };
    };

    const usersById = new Map((data.includes?.users ?? []).map(u => [u.id, u]));

    const tweets: XSearchTweet[] = (data.data ?? []).map(t => {
      const user = usersById.get(t.author_id);
      const username = user?.username ?? 'unknown';
      return {
        id: t.id,
        text: t.text,
        createdAt: t.created_at,
        likeCount: t.public_metrics.like_count,
        retweetCount: t.public_metrics.retweet_count,
        replyCount: t.public_metrics.reply_count,
        quoteCount: t.public_metrics.quote_count,
        impressionCount: t.public_metrics.impression_count,
        authorUsername: username,
        authorName: user?.name ?? 'Unknown',
        url: `https://x.com/${username}/status/${t.id}`,
      };
    });

    return { ok: true, tweets };
  } catch (err) {
    return { ok: false, status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
