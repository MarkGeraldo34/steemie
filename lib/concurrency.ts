/**
 * Runs async jobs with a concurrency cap — used by any tool that scans many
 * chains (or many items within a chain) so it doesn't burst past a free-tier
 * API rate limit (e.g. Etherscan's ~3 req/sec) when checking many things at
 * once. Shared between wallet-holdings-tool.ts and tokenomics-tool.ts.
 */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
