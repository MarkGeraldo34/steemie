'use client';

import { useState } from 'react';
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
 *
 * Ethos details + the X profile link stay hidden behind the handle until
 * clicked — a search can surface many handles at once, and showing every
 * badge/link up front is noisy. (A handle looked up on its own, via the
 * genuineness tool, still shows its Ethos badge inline — see page.tsx.)
 */
export function TwitterLeadsList({ leads }: { leads: Lead[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (leads.length === 0) return null;

  return (
    <div className="my-1 flex flex-col gap-1.5">
      {leads.map((lead, i) => {
        const open = openIndex === i;
        return (
          <div key={i} className="flex flex-col gap-1.5 rounded-md bg-zinc-100 px-2 py-1.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setOpenIndex(open ? null : i)}
                aria-expanded={open}
                className="font-semibold text-brand hover:underline"
              >
                @{lead.postedBy}
              </button>
              <span className="max-w-[220px] truncate text-zinc-500">{lead.text}</span>
            </div>
            {open && (
              <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-1.5">
                <EthosScoreBadge score={lead.ethosScore} level={lead.ethosLevel} />
                <a
                  href={lead.postedByProfileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                >
                  View @{lead.postedBy} on X ↗
                </a>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
