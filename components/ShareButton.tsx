'use client';

import { useState } from 'react';
import type { EthosByHandle } from './markdownComponents';

type Status = 'idle' | 'creating' | 'copied' | 'error';

/**
 * Creates a shareable link for one finished search (on click, not eagerly —
 * most searches are never shared, so this avoids writing one to Redis for
 * every message) and copies it to the clipboard. The link opens
 * app/share/[id]/page.tsx, a read-only snapshot of this exact query +
 * answer (including its Ethos dropdowns) that works for someone who never
 * ran the search themselves.
 */
export function ShareButton({
  query,
  report,
  ethosByHandle,
  source,
}: {
  query: string;
  report: string;
  ethosByHandle: EthosByHandle;
  source: 'chat' | 'premium';
}) {
  const [status, setStatus] = useState<Status>('idle');

  const handleClick = async () => {
    if (status === 'creating') return;
    setStatus('creating');
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, report, ethosByHandle, source }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        throw new Error(data.error ?? 'Failed to create link');
      }
      await navigator.clipboard.writeText(`${window.location.origin}/share/${data.id}`);
      setStatus('copied');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === 'creating'}
      className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-brand/40 hover:text-brand disabled:opacity-50"
    >
      {status === 'copied' ? (
        'Link copied ✓'
      ) : status === 'error' ? (
        "Couldn't create link"
      ) : status === 'creating' ? (
        'Creating link…'
      ) : (
        <>
          <span aria-hidden="true">🔗</span> Share
        </>
      )}
    </button>
  );
}
