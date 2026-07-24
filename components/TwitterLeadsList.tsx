import { EthosScoreBadge } from './EthosScoreBadge';
import type { EthosLevel } from '@/lib/ethos-api';

type Lead = {
  text: string;
  postedBy: string;
  postedByProfileUrl: string;
  ethosScore: number | null;
  ethosLevel: EthosLevel | null;
};

/**
 * Renders leads (raffles/whitelist/token-sale search results) in the exact
 * order the tool already sorted them — highest Ethos score first, unrated
 * accounts last. Reads straight from tool output rather than the model's
 * prose, so the order and badge colors are always accurate regardless of
 * how the agent narrates the results.
 */
export function TwitterLeadsList({ leads }: { leads: Lead[] }) {
  if (leads.length === 0) return null;

  return (
    <div className="my-1 flex flex-col gap-1.5">
      {leads.map((lead, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-md bg-zinc-100 px-2 py-1.5 text-xs">
          <a
            href={lead.postedByProfileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand hover:underline"
          >
            @{lead.postedBy}
          </a>
          <EthosScoreBadge score={lead.ethosScore} level={lead.ethosLevel} />
          <span className="max-w-[220px] truncate text-zinc-500">{lead.text}</span>
        </div>
      ))}
    </div>
  );
}
