import { tool } from 'ai';
import { z } from 'zod';
import { fetchEthosProfile } from '../ethos-api';

/**
 * Live source (Ethos Network community trust score): see lib/ethos-api.ts.
 *
 * Live source (X API v2): account age, follower/following ratio, tweet
 * count, and blue-verified status via GET /2/users/by/username/:username.
 * Requires X_API_BEARER_TOKEN in .env.local (app-only read auth).
 */

export const twitterGenuinenessTool = tool({
  description:
    "Check a Twitter/X account's genuineness and reputation before trusting claims (e.g. a token sale or raffle) posted by it. Combines Ethos Network's community trust score (live) with X/Twitter account signals (age, follower ratio, activity — pending X API credits).",
  inputSchema: z.object({
    handle: z.string().describe('Twitter/X username, with or without the leading @'),
  }),
  execute: async ({ handle }) => {
    const username = handle.replace(/^@/, '');

    const ethosResult = await fetchEthosProfile(username);
    const ethos = ethosResult.ok
      ? {
          source: 'ethos-network',
          note: 'Ethos score reflects community-vouched trust (peer reviews + ETH vouches), not automated bot/fake-account detection.',
          profile: ethosResult.profile,
        }
      : {
          source: 'ethos-network',
          note: ethosResult.note,
          error: ethosResult.error,
        };

    const twitterAccountSignals: {
      source: string;
      note: string;
      error?: string;
      accountCreatedAt: string | null;
      accountAgeDays: number | null;
      followersCount: number | null;
      followingCount: number | null;
      tweetCount: number | null;
      listedCount: number | null;
      isBlueVerified: boolean | null;
      isProtected: boolean | null;
    } = {
      source: 'x-api',
      note: '',
      accountCreatedAt: null,
      accountAgeDays: null,
      followersCount: null,
      followingCount: null,
      tweetCount: null,
      listedCount: null,
      isBlueVerified: null,
      isProtected: null,
    };

    const bearerToken = process.env.X_API_BEARER_TOKEN;

    if (!bearerToken) {
      twitterAccountSignals.source = 'stub-no-live-data';
      twitterAccountSignals.note =
        'X_API_BEARER_TOKEN is not set. Add it to .env.local once X API credits are purchased to enable live account-age, follower-ratio, and activity-pattern checks.';
    } else {
      try {
        const res = await fetch(
          `https://api.x.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=created_at,public_metrics,verified,protected`,
          { headers: { Authorization: `Bearer ${bearerToken}` } },
        );

        if (res.status === 404) {
          twitterAccountSignals.note = 'No X/Twitter account exists for this handle.';
        } else if (!res.ok) {
          twitterAccountSignals.note = 'X API returned an error rather than account data.';
          twitterAccountSignals.error = `HTTP ${res.status}`;
        } else {
          const data = (await res.json()) as {
            data: {
              created_at: string;
              public_metrics: {
                followers_count: number;
                following_count: number;
                tweet_count: number;
                listed_count: number;
              };
              verified: boolean;
              protected: boolean;
            };
          };
          const createdAt = data.data.created_at;
          twitterAccountSignals.accountCreatedAt = createdAt;
          twitterAccountSignals.accountAgeDays = Math.floor(
            (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24),
          );
          twitterAccountSignals.followersCount = data.data.public_metrics.followers_count;
          twitterAccountSignals.followingCount = data.data.public_metrics.following_count;
          twitterAccountSignals.tweetCount = data.data.public_metrics.tweet_count;
          twitterAccountSignals.listedCount = data.data.public_metrics.listed_count;
          twitterAccountSignals.isBlueVerified = data.data.verified;
          twitterAccountSignals.isProtected = data.data.protected;
          twitterAccountSignals.note =
            'Live account signals. "verified" here is X\'s blue-check status, not an authenticity judgment on its own — weigh it alongside account age and follower ratio.';
        }
      } catch (err) {
        twitterAccountSignals.note = 'X API lookup failed.';
        twitterAccountSignals.error = err instanceof Error ? err.message : String(err);
      }
    }

    return {
      handle: username,
      profileUrl: `https://x.com/${username}`,
      ethos,
      twitterAccountSignals,
    };
  },
});
