'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CryptoIntelAgentUIMessage } from '@/lib/agents/crypto-intel-agent';
import { WalletConnectButton } from '@/components/WalletConnectButton';
import { EthosScoreBadge } from '@/components/EthosScoreBadge';
import type { EthosLevel } from '@/lib/tools/twitter-genuineness-tool';

const TOOL_LABELS: Record<string, string> = {
  'tool-tokenSales': 'Searching token sales',
  'tool-whitelistNft': 'Searching whitelist / NFT mints',
  'tool-trends': 'Checking market trends',
  'tool-raffles': 'Searching raffles',
  'tool-riskAnalysis': 'Running due-diligence check',
  'tool-walletHoldings': 'Checking wallet holdings',
  'tool-twitterGenuineness': 'Checking account genuineness',
};

const EXAMPLE_PROMPTS = [
  'Any solid whitelist spots opening this week?',
  'What token sales are trending right now?',
  'Is this raffle legit — worth entering?',
  'Check holdings for 0x1234…abcd',
];

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
    <th className="border border-zinc-200 bg-zinc-50 px-2 py-1 text-left font-medium" {...props} />
  ),
  td: (props: React.ComponentProps<'td'>) => <td className="border border-zinc-200 px-2 py-1" {...props} />,
  code: (props: React.ComponentProps<'code'>) => (
    <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs" {...props} />
  ),
};

export default function Home() {
  const { messages, sendMessage, status, setMessages, stop } = useChat<CryptoIntelAgentUIMessage>({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  });
  const [input, setInput] = useState('');

  const submit = (text: string) => {
    if (text.trim()) {
      sendMessage({ text });
      setInput('');
    }
  };

  const goHome = () => {
    stop();
    setMessages([]);
    setInput('');
  };

  return (
    <div className="flex h-dvh flex-col bg-white font-sans">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <button
          type="button"
          onClick={goHome}
          aria-label="Go to home"
          className="flex items-center gap-2 rounded-md transition-opacity hover:opacity-80"
        >
          <img src="/logo.svg" alt="" className="h-7 w-7 rounded-full" />
          <span className="text-base font-semibold text-brand">Steemie</span>
        </button>
        <WalletConnectButton />
      </header>

      <main className="flex flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 sm:px-6">
          {messages.length === 0 ? (
            <div className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden py-12 text-center">
              <div className="pointer-events-none absolute inset-0 -z-10">
                <div className="absolute -top-10 -left-10 h-56 w-56 rounded-full bg-brand/30 blur-3xl" />
                <div className="absolute top-16 -right-10 h-56 w-56 rounded-full bg-accent/40 blur-3xl" />
              </div>
              <img src="/logo.svg" alt="" className="h-14 w-14 rounded-full" />
              <div>
                <h1 className="text-lg font-semibold text-zinc-900">How can I help you today?</h1>
                <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
                  Ask about ongoing token sales, whitelist/NFT mints, trends, or raffles, check a
                  wallet&apos;s holdings, and get an evidence-based read on whether an opportunity
                  looks worth pursuing.
                </p>
              </div>
              <div className="grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
                {EXAMPLE_PROMPTS.map(prompt => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInput(prompt)}
                    className="rounded-xl border border-white/60 bg-white/40 px-3 py-2 text-left text-sm text-zinc-700 shadow-sm backdrop-blur-md transition-colors hover:border-brand/40 hover:bg-white/60"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-5 py-6">
              {messages.map(message => (
                <div
                  key={message.id}
                  className={message.role === 'user' ? 'flex justify-end' : 'flex items-start gap-2.5'}
                >
                  {message.role !== 'user' && (
                    <img src="/logo.svg" alt="" className="mt-0.5 h-6 w-6 shrink-0 rounded-full" />
                  )}
                  <div
                    className={
                      message.role === 'user'
                        ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-accent px-4 py-2 text-accent-ink'
                        : 'max-w-[85%] text-zinc-800'
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
                          <div key={i} className="text-sm leading-relaxed">
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

                        const ethosProfile =
                          part.type === 'tool-twitterGenuineness' && toolPart.state === 'output-available'
                            ? (
                                toolPart.output as {
                                  ethos?: { profile?: { ethosScore: number; level: EthosLevel } };
                                }
                              )?.ethos?.profile
                            : undefined;

                        return (
                          <div key={i} className="my-1 flex flex-wrap items-center gap-2">
                            <div className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
                              {toolPart.state === 'output-available' ? (
                                <span className="mr-1 text-brand">✓</span>
                              ) : (
                                <span className="mr-1">…</span>
                              )}
                              {label}
                              {toolPart.state === 'output-error' && ' (failed)'}
                            </div>
                            {ethosProfile && (
                              <EthosScoreBadge score={ethosProfile.ethosScore} level={ethosProfile.level} />
                            )}
                          </div>
                        );
                      }

                      return null;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <div className="shrink-0 border-t border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <form
          onSubmit={e => {
            e.preventDefault();
            submit(input);
          }}
          className="mx-auto flex w-full max-w-2xl items-center gap-2"
        >
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={status !== 'ready'}
            placeholder="Ask about a token sale, whitelist, trend, or raffle…"
            className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition-colors focus:border-brand disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={status !== 'ready'}
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition-opacity disabled:opacity-50"
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
      </div>
    </div>
  );
}
