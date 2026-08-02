'use client';

import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createMarkdownComponents } from './markdownComponents';
import type { SharedSearch } from '@/lib/share-store';

const SOURCE_LABEL: Record<SharedSearch['source'], string> = {
  chat: 'Steemie search',
  premium: 'Steemie Premium Check',
};

/** Read-only rendering of one shared search — no input box, no tool-call agent, just the saved query + answer. */
export function SharedSearchView({ query, report, ethosByHandle, source }: SharedSearch) {
  const markdownComponents = createMarkdownComponents(ethosByHandle);

  return (
    <div className="flex h-dvh flex-col bg-background font-sans">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <Link href="/" className="flex items-center gap-2 rounded-md transition-opacity hover:opacity-80">
          <img src="/logo.jpg" alt="" className="h-7 w-7 rounded-full" />
          <span className="text-base font-semibold text-brand">Steemie</span>
        </Link>
        <Link
          href="/"
          className="rounded-full border-2 border-brand/40 bg-brand/10 px-3 py-1 text-xs font-medium text-brand transition-opacity hover:opacity-80"
        >
          Ask your own question →
        </Link>
      </header>

      <main className="flex flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6">
          <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">{SOURCE_LABEL[source]}</p>

          <div className="flex justify-end">
            <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-accent px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap text-accent-ink">
              {query}
            </p>
          </div>

          <div className="flex items-start gap-2.5">
            <img src="/logo.jpg" alt="" className="mt-0.5 h-6 w-6 shrink-0 rounded-full" />
            <div className="max-w-[85%] text-sm leading-relaxed text-zinc-100">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {report}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
