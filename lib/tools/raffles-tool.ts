import { tool } from 'ai';
import { z } from 'zod';

/**
 * STUB — no free/keyless live source exists for this.
 *
 * Raffle listings live almost entirely inside individual project Discord
 * servers and X/Twitter posts, not a queryable API. Premint and similar
 * aggregators don't expose public APIs. Making this real requires either a
 * Discord bot that scrapes servers you've joined, or an X API integration
 * (paid tier) watching specific accounts/hashtags.
 */
export const rafflesTool = tool({
  description: 'Look up ongoing crypto/NFT raffles and giveaways.',
  inputSchema: z.object({
    query: z.string().optional().describe('Project or keyword to filter by'),
  }),
  execute: async ({ query }) => {
    return {
      source: 'stub-no-live-data',
      note: 'No live raffle feed is configured yet. Wire this tool to a real API before trusting results.',
      filtersApplied: { query: query ?? null },
      raffles: [] as Array<{
        name: string;
        entryDeadline: string;
        entryRequirements: string;
        prize: string;
        officialUrl: string;
      }>,
    };
  },
});
