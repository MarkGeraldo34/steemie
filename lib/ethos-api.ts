/**
 * Shared Ethos Network helpers: free, public, no API key required — just a
 * client-identifying header. See https://developers.ethos.network/.
 *
 * Used by twitter-genuineness-tool.ts (full profile for a single handle)
 * and by raffles/whitelist/token-sales tools (score-only, to badge and sort
 * every poster surfaced by a search).
 *
 * Important: Ethos measures *community-vouched trust* (peer reviews + ETH
 * vouches), not automated bot/fake-account detection. A brand-new but
 * genuinely real account will have no Ethos profile simply because nobody
 * has reviewed it yet — a 404 here means "unreviewed," not "fake."
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

export function ethosScoreLevel(score: number): EthosLevel {
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

export type EthosProfile = {
  displayName: string;
  ethosScore: number;
  level: EthosLevel;
  accountStatus: string;
  humanVerificationStatus: string | null;
  reviewsReceived: { negative: number; neutral: number; positive: number };
  vouchesReceived: { count: number; ethTotal: number };
  profileUrl: string;
};

export type EthosLookupResult =
  | { ok: true; profile: EthosProfile }
  | { ok: false; status: 'not-found' | 'error'; note: string; error?: string };

export async function fetchEthosProfile(username: string): Promise<EthosLookupResult> {
  try {
    const res = await fetch(`https://api.ethos.network/api/v2/user/by/x/${encodeURIComponent(username)}`, {
      headers: { 'X-Ethos-Client': ETHOS_CLIENT_HEADER },
    });

    if (res.status === 404) {
      return {
        ok: false,
        status: 'not-found',
        note: 'No Ethos profile found for this handle. This means the crypto community has not reviewed or vouched for this account yet — it does NOT mean the account is fake. Treat reputation as unknown, not negative.',
      };
    }
    if (!res.ok) {
      return { ok: false, status: 'error', note: 'Ethos API returned an error rather than profile data.', error: `HTTP ${res.status}` };
    }

    const data = (await res.json()) as EthosUserResponse;
    return {
      ok: true,
      profile: {
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
      },
    };
  } catch (err) {
    return { ok: false, status: 'error', note: 'Ethos lookup failed.', error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Attach {ethosScore, ethosLevel} to every lead (by its `postedBy` handle)
 * and sort descending by score — highest/best Ethos score first, leads with
 * no Ethos profile (unknown reputation) last. Used by raffles/whitelist/
 * token-sales tools so every handle a search surfaces is scored and ordered
 * consistently, not just handles the user explicitly asks to check.
 */
export async function attachEthosScoresAndSort<T extends { postedBy: string }>(
  leads: T[],
): Promise<(T & { ethosScore: number | null; ethosLevel: EthosLevel | null })[]> {
  const uniqueHandles = Array.from(new Set(leads.map(l => l.postedBy)));
  const results = await Promise.all(uniqueHandles.map(async handle => [handle, await fetchEthosProfile(handle)] as const));

  const scoreByHandle = new Map(
    results.map(([handle, result]) => [
      handle,
      result.ok ? { ethosScore: result.profile.ethosScore, ethosLevel: result.profile.level } : { ethosScore: null, ethosLevel: null },
    ]),
  );

  const enriched = leads.map(lead => ({
    ...lead,
    ...(scoreByHandle.get(lead.postedBy) ?? { ethosScore: null, ethosLevel: null }),
  }));

  enriched.sort((a, b) => (b.ethosScore ?? -1) - (a.ethosScore ?? -1));

  return enriched;
}
