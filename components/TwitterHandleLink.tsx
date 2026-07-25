'use client';

import { useState } from 'react';
import { EthosScoreBadge } from './EthosScoreBadge';
import type { EthosLevel } from '@/lib/ethos-api';

/**
 * An @handle mention inside the agent's write-up. Clicking it toggles a
 * small dropdown with its Ethos badge and the actual link to the X profile
 * — the link itself is never navigated to directly, only revealed on click.
 */
export function TwitterHandleLink({
  profileUrl,
  ethosScore,
  ethosLevel,
  children,
}: {
  profileUrl: string;
  ethosScore: number | null;
  ethosLevel: EthosLevel | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="font-semibold text-brand hover:underline"
      >
        {children}
      </button>
      {open && (
        <span className="absolute left-0 top-full z-10 mt-1 flex items-center gap-2 whitespace-nowrap rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs shadow-md">
          <EthosScoreBadge score={ethosScore} level={ethosLevel} />
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
          >
            View on X ↗
          </a>
        </span>
      )}
    </span>
  );
}
