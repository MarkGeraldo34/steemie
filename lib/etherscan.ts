/**
 * Shared Etherscan V2 unified-API REST helper. Covers all chains in
 * ETHERSCAN_CHAIN_IDS (lib/chains.ts) through one key. Requires
 * ETHERSCAN_API_KEY — free at https://etherscan.io/apis. Used by
 * wallet-holdings-tool.ts and tokenomics-tool.ts.
 */

export type EtherscanResult = { status: string; message: string; result: unknown };

export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// Etherscan's free tier reports rate-limiting as an in-body status:"0" (not
// an HTTP 429), e.g. message "NOTOK" / result "Max rate limit reached" — so
// a plain non-'1' status can mean either "rate-limited" or "genuinely no
// data". This retries once on any non-'1' status before giving up, so a
// rate-limited call across many chains doesn't get silently misread as "no
// data here".
export async function etherscanCall(params: Record<string, string>, apiKey: string): Promise<EtherscanResult> {
  const url = new URL('https://api.etherscan.io/v2/api');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('apikey', apiKey);
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    const data = (await res.json()) as EtherscanResult;
    if (data.status === '1' || attempt === 1) return data;
    await sleep(500);
  }
  // unreachable, satisfies TS
  return { status: '0', message: 'NOTOK', result: [] };
}
