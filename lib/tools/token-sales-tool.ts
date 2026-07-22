import { tool } from 'ai';
import { z } from 'zod';

/**
 * STUB — no free/keyless live source exists for this.
 *
 * Checked and ruled out:
 *  - DeFiLlama /raises is now paywalled (requires their Pro API plan), and
 *    even on the paid tier it's historical funding rounds, not a live public
 *    sale calendar.
 *  - CoinGecko has no ICO/public-sale-calendar endpoint.
 *  - Real "ongoing public sale" calendars (ICO Drops, CoinList, etc.) are
 *    proprietary products without public APIs.
 *
 * To make this real: either pay for a data vendor (DeFiLlama Pro, ICO Drops
 * partner feed) or build a scraper against specific launchpads you care
 * about (e.g. individual project APIs).
 * Shape is intentionally structured so the agent can reason over concrete
 * fields rather than free text.
 */
export const tokenSalesTool = tool({
  description:
    'Look up ongoing or upcoming public and private crypto token sales, optionally filtered by chain or category.',
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe('Project name, ticker, or category keyword to filter by'),
    chain: z.string().optional().describe('Filter by blockchain, e.g. "ethereum", "solana"'),
    saleType: z.enum(['public', 'private', 'any']).default('any'),
  }),
  execute: async ({ query, chain, saleType }) => {
    // TODO: wire to a real data source. Returning empty + a source note
    // keeps the agent from inventing sales when no data is configured.
    return {
      source: 'stub-no-live-data',
      note: 'No live token sale feed is configured yet. Wire this tool to a real API (e.g. CoinGecko, DeFiLlama raises, ICO calendars) before trusting results.',
      filtersApplied: { query: query ?? null, chain: chain ?? null, saleType },
      sales: [] as Array<{
        project: string;
        chain: string;
        saleType: 'public' | 'private';
        startsAt: string;
        endsAt: string;
        hardCap: string;
        vesting: string;
        officialUrl: string;
      }>,
    };
  },
});
