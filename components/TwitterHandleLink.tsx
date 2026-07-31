'use client';

import { useEffect, useRef, useState } from 'react';
import { EthosScoreBadge } from './EthosScoreBadge';
import type { EthosLevel } from '@/lib/ethos-api';

// Rough estimate of the dropdown's rendered width — wide enough to cover the
// Ethos badge + "View on X ↗" link at this font size. Only used to decide
// which side to open on, so it doesn't need to be exact.
const ESTIMATED_DROPDOWN_WIDTH = 220;

/**
 * An @handle mention inside the agent's write-up. Clicking it toggles a
 * small dropdown with its Ethos badge and the actual link to the X profile
 * — the link itself is never navigated to directly, only revealed on click.
 *
 * Search-result leads render the handle near the end of a line (e.g. "...—
 * [@handle](url), date"), which on a narrow/mobile viewport is often close
 * to the right edge. A dropdown that always opens left-anchored (growing
 * rightward) can then render partly or entirely off-screen — functionally
 * invisible even though it did open. This measures available space on open
 * and flips to right-anchored (growing leftward) when needed, and only does
 * so if that wouldn't just push it off the left edge instead.
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
  const [alignRight, setAlignRight] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const overflowsRight = rect.left + ESTIMATED_DROPDOWN_WIDTH > window.innerWidth;
    const flippingWouldOverflowLeft = rect.right - ESTIMATED_DROPDOWN_WIDTH < 0;
    setAlignRight(overflowsRight && !flippingWouldOverflowLeft);
  }, [open]);

  // Close on any click/tap outside this handle — pointerdown covers mouse
  // and touch alike, and fires before the toggle button's own click, so
  // clicking a different handle's button still opens that one normally
  // (this dropdown just closes first).
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  return (
    <span ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="font-semibold text-brand hover:underline"
      >
        {children}
      </button>
      {open && (
        <span
          className={`absolute top-full z-10 mt-1 flex flex-col items-start gap-1.5 whitespace-nowrap rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs shadow-md ${
            alignRight ? 'right-0' : 'left-0'
          }`}
        >
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
