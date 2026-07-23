import { tool } from 'ai';
import { z } from 'zod';

/**
 * Live source (Ethos Network community trust score): free, public, no API
 * key required — just a client-identifying header. See
 * https://developers.ethos.network/.
 *
 * X/Twitter account signals (account age, follower/following ratio, tweet
 * frequency, blue-verified status) are still stubbed pending X API credits.
 * Set X_API_BEARER_TOKEN in .env.local once purchased to enable them.
 *
 * Important: Ethos measures *community-vouched trust* (peer reviews + ETH
 * vouches), not automated bot/fake-account detection. A brand-new but
 * genuinely real account will have no Ethos profile simply because nobody
 * has reviewed it yet — a 404 here means "unreviewed," not "fake." Pair
 * this with the X account signals once available for a fuller picture.
 */

const ETHOS_CLIENT_HEADER = 'steemie';

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

    const twitterAccountSignals = {
      source: 'stub-no-live-data',
      note: 'X_API_BEARER_TOKEN is not set. Add it to .env.local once X API credits are purchased to enable live account-age, follower-ratio, and activity-pattern checks.',
      accountCreatedAt: null as string | null,
      followersCount: null as number | null,
      followingCount: null as number | null,
      tweetCount: null as number | null,
      isBlueVerified: null as boolean | null,
    };

    return {
      handle: username,
      ethos,
      twitterAccountSignals,
    };
  },
});
