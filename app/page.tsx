'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CryptoIntelAgentUIMessage } from '@/lib/agents/crypto-intel-agent';

const TOOL_LABELS: Record<string, string> = {
  'tool-tokenSales': 'Searching token sales',
  'tool-whitelistNft': 'Searching whitelist / NFT mints',
  'tool-trends': 'Checking market trends',
  'tool-raffles': 'Searching raffles',
  'tool-riskAnalysis': 'Running due-diligence check',
  'tool-walletHoldings': 'Checking wallet holdings',
};

const markdownComponents = {
  h1: (props: React.ComponentProps<'h1'>) => <h1 className="mt-3 mb-1 text-base font-semibold first:mt-0" {...props} />,
  h2: (props: React.ComponentProps<'h2'>) => <h2 className="mt-3 mb-1 text-base font-semibold first:mt-0" {...props} />,
  h3: (props: React.ComponentProps<'h3'>) => <h3 className="mt-2 mb-1 text-sm font-semibold first:mt-0" {...props} />,
  p: (props: React.ComponentProps<'p'>) => <p className="mb-2 text-sm leading-relaxed last:mb-0" {...props} />,
  ul: (props: React.ComponentProps<'ul'>) => <ul className="mb-2 list-disc space-y-0.5 pl-5 text-sm last:mb-0" {...props} />,
  ol: (props: React.ComponentProps<'ol'>) => <ol className="mb-2 list-decimal space-y-0.5 pl-5 text-sm last:mb-0" {...props} />,
  strong: (props: React.ComponentProps<'strong'>) => <strong className="font-semibold" {...props} />,
  table: (props: React.ComponentProps<'table'>) => (
    <div className="mb-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs" {...props} />
    </div>
  ),
  th: (props: React.ComponentProps<'th'>) => (
    <th className="border border-zinc-300 bg-zinc-100 px-2 py-1 text-left font-medium dark:border-zinc-700 dark:bg-zinc-800" {...props} />
  ),
  td: (props: React.ComponentProps<'td'>) => <td className="border border-zinc-300 px-2 py-1 dark:border-zinc-700" {...props} />,
  code: (props: React.ComponentProps<'code'>) => (
    <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800" {...props} />
  ),
};

export default function Home() {
  const { messages, sendMessage, status } = useChat<CryptoIntelAgentUIMessage>({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  });
  const [input, setInput] = useState('');

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans">
      <main className="flex flex-1 w-full max-w-2xl flex-col py-8 px-4 sm:px-0">
        <header className="mb-4 border-b-2 border-accent pb-4">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="" className="h-8 w-8 rounded-md" />
            <h1 className="text-xl font-semibold text-brand">
              Steemie
            </h1>
          </div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Ask about ongoing token sales, whitelist/NFT mints, trends, or raffles, check a
            wallet&apos;s holdings, and get an evidence-based read on whether an opportunity
            looks worth pursuing.
          </p>
        </header>

        <div className="flex-1 flex flex-col gap-4 overflow-y-auto pb-4">
          {messages.map(message => (
            <div
              key={message.id}
              className={
                message.role === 'user'
                  ? 'self-end max-w-[85%] rounded-2xl bg-accent px-4 py-2 text-accent-ink'
                  : 'self-start max-w-[95%] rounded-2xl bg-white px-4 py-2 text-black shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-50 dark:ring-zinc-800'
              }
            >
              {message.parts.map((part, i) => {
                if (part.type === 'text') {
                  if (message.role === 'user') {
                    return (
                      <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed">
                        {part.text}
                      </p>
                    );
                  }
                  return (
                    <div key={i}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                        {part.text}
                      </ReactMarkdown>
                    </div>
                  );
                }

                if (part.type.startsWith('tool-')) {
                  const label = TOOL_LABELS[part.type] ?? part.type;
                  const toolPart = part as {
                    state: string;
                    input?: unknown;
                    output?: unknown;
                  };
                  return (
                    <div
                      key={i}
                      className="my-1 rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    >
                      {toolPart.state === 'output-available' ? (
                        <span className="text-accent">✓ </span>
                      ) : (
                        '… '
                      )}
                      {label}
                      {toolPart.state === 'output-error' && ' (failed)'}
                    </div>
                  );
                }

                return null;
              })}
            </div>
          ))}
        </div>

        <form
          onSubmit={e => {
            e.preventDefault();
            if (input.trim()) {
              sendMessage({ text: input });
              setInput('');
            }
          }}
          className="flex gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800"
        >
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={status !== 'ready'}
            placeholder="e.g. Any solid whitelist spots opening this week?"
            className="flex-1 rounded-full border-2 border-brand/40 bg-brand/10 px-4 py-2 text-sm text-black outline-none focus:border-brand focus:bg-brand/15 disabled:opacity-50 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={status !== 'ready'}
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink disabled:opacity-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
          </button>
        </form>
      </main>
    </div>
  );
}
