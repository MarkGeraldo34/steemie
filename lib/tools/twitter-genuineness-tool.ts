import { tool } from 'ai';
import { z } from 'zod';

/**
 * Live source (Ethos Network community trust score): free, public, no API
 * key required — just a client-identifying header. See
 * https://developers.ethos.network/.
 *
 * Live source (X API v2): account age, follower/following ratio, tweet
 * count, and blue-verified status via GET /2/users/by/username/:username.
 * Requires X_API_BEARER_TOKEN in .env.local (app-only read auth).
 *
 * Important: Ethos measures *community-vouched trust* (peer reviews + ETH
 * vouches), not automated bot/fake-account detection. A brand-new but
 * genuinely real account will have no Ethos profile simply because nobody
 * has reviewed it yet — a 404 here means "unreviewed," not "fake." Pair
 * this with the X account signals for a fuller picture.
 */

const ETHOS_CLIENT_HEADER = 'steemie';

export type EthosLevel =
  | 'untrusted'
  | 'questionable'
  | 'neutral'
  | 'known'
  | 'established'
  | 'reputable'
  | 'exemplary'
  | 'distinguished'
  | 'revered'
  | 'renowned';

const ETHOS_LEVEL_BANDS: { max: number; level: EthosLevel }[] = [
  { max: 799, level: 'untrusted' },
  { max: 1199, level: 'questionable' },
  { max: 1399, level: 'neutral' },
  { max: 1599, level: 'known' },
  { max: 1799, level: 'established' },
  { max: 1999, level: 'reputable' },
  { max: 2199, level: 'exemplary' },
  { max: 2399, level: 'distinguished' },
  { max: 2599, level: 'revered' },
  { max: 2800, level: 'renowned' },
];

function ethosScoreLevel(score: number): EthosLevel {
  return (ETHOS_LEVEL_BANDS.find(band => score <= band.max) ?? ETHOS_LEVEL_BANDS[ETHOS_LEVEL_BANDS.length - 1])
    .level;
}

type EthosUserResponse = {
  displayName: string;
  username: string | null;
  score: number;
  status: 'ACTIVE' | 'INACTIVE' | 'MERGED';
  humanVerificationStatus: 'REQUESTED' | 'VERIFIED' | 'REVOKED' | 'PENDING' | null;
  links: { profile: string; scoreBreakdown: string };
  stats: {
    review: { received: { negative: number; neutral: number; positive: number } };
    vouch: {
      received: { amountWeiTotal: string; count: number };
    };
  };
};

export const twitterGenuinenessTool = tool({
  description:
    "Check a Twitter/X account's genuineness and reputation before trusting claims (e.g. a token sale or raffle) posted by it. Combines Ethos Network's community trust score (live) with X/Twitter account signals (age, follower ratio, activity — pending X API credits).",
  inputSchema: z.object({
    handle: z.string().describe('Twitter/X username, with or without the leading @'),
  }),
  execute: async ({ handle }) => {
    const username = handle.replace(/^@/, '');

    const ethos: {
      source: string;
      note: string;
      error?: string;
      profile?: {
        displayName: string;
        ethosScore: number;
        level: EthosLevel;
        accountStatus: string;
        humanVerificationStatus: string | null;
        reviewsReceived: { negative: number; neutral: number; positive: number };
        vouchesReceived: { count: number; ethTotal: number };
        profileUrl: string;
      };
    } = {
      source: 'ethos-network',
      note: '',
    };

    try {
      const res = await fetch(
        `https://api.ethos.network/api/v2/user/by/x/${encodeURIComponent(username)}`,
        { headers: { 'X-Ethos-Client': ETHOS_CLIENT_HEADER } },
      );

      if (res.status === 404) {
        ethos.note =
          'No Ethos profile found for this handle. This means the crypto community has not reviewed or vouched for this account yet — it does NOT mean the account is fake. Treat reputation as unknown, not negative.';
      } else if (!res.ok) {
        ethos.note = 'Ethos API returned an error rather than profile data.';
        ethos.error = `HTTP ${res.status}`;
      } else {
        const data = (await res.json()) as EthosUserResponse;
        ethos.profile = {
          displayName: data.displayName,
          ethosScore: data.score,
          level: ethosScoreLevel(data.score),
          accountStatus: data.status,
          humanVerificationStatus: data.humanVerificationStatus,
          reviewsReceived: data.stats.review.received,
          vouchesReceived: {
            count: data.stats.vouch.received.count,
            ethTotal: Number(data.stats.vouch.received.amountWeiTotal) / 1e18,
          },
          profileUrl: data.links.profile,
        };
        ethos.note =
          'Ethos score reflects community-vouched trust (peer reviews + ETH vouches), not automated bot/fake-account detection.';
      }
    } catch (err) {
      ethos.note = 'Ethos lookup failed.';
      ethos.error = err instanceof Error ? err.message : String(err);
    }

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
