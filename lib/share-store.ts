import { randomBytes } from 'crypto';
import { Redis } from '@upstash/redis';
import type { EthosByHandle } from '@/components/markdownComponents';

const redis = Redis.fromEnv();

const SHARE_KEY_PREFIX = 'steemie:share:';
// Shared links are for showing someone a specific search result, not
// permanent archival — bound Redis growth with a generous expiry rather than
// keeping every share forever.
const SHARE_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

// Anonymous, unauthenticated endpoint — cap what a single share can hold so
// one request can't stuff an arbitrarily large blob into Redis.
export const SHARE_QUERY_MAX_LENGTH = 500;
export const SHARE_REPORT_MAX_LENGTH = 20_000;

export type SharedSearch = {
  query: string;
  report: string;
  ethosByHandle: EthosByHandle;
  source: 'chat' | 'premium';
  createdAt: number;
};

function generateShareId(): string {
  // 9 random bytes -> 12 base64url chars, URL-safe and short enough to
  // paste/read comfortably.
  return randomBytes(9).toString('base64url');
}

export async function saveSharedSearch(data: Omit<SharedSearch, 'createdAt'>): Promise<string> {
  const id = generateShareId();
  const record: SharedSearch = { ...data, createdAt: Date.now() };
  await redis.set(`${SHARE_KEY_PREFIX}${id}`, record, { ex: SHARE_TTL_SECONDS });
  return id;
}

export async function getSharedSearch(id: string): Promise<SharedSearch | null> {
  return redis.get<SharedSearch>(`${SHARE_KEY_PREFIX}${id}`);
}
