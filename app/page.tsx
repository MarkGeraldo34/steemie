'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';
import type { CryptoIntelAgentUIMessage } from '@/lib/agents/crypto-intel-agent';
import { ChatMessage } from '@/components/ChatMessage';
import { PremiumRiskCheck } from '@/components/PremiumRiskCheck';

const EXAMPLE_PROMPTS = [
  'Any solid whitelist spots opening this week?',
  'What token sales are trending right now?',
  'What is the personality of my Twitter handle?',
  'Check holdings for 0x1234…abcd',
];

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
    <div className="flex h-dvh flex-col bg-background font-sans">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <button
          type="button"
          onClick={goHome}
          aria-label="Go to home"
          className="flex items-center gap-2 rounded-md transition-opacity hover:opacity-80"
        >
          <img src="/logo.jpg" alt="" className="h-7 w-7 rounded-full" />
          <span className="text-base font-semibold text-brand">Steemie</span>
        </button>
        <a
          href="https://web3.okx.com/xlayer/bridge"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border-2 border-brand/40 bg-brand/10 px-3 py-1 text-xs font-medium text-brand transition-opacity hover:opacity-80"
        >
          Get USD₮0 on X Layer
        </a>
      </header>

      <main className="flex flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 sm:px-6">
          {messages.length === 0 ? (
            <div className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden py-12 text-center">
              <div className="pointer-events-none absolute inset-0 -z-10">
                <div className="absolute -top-10 -left-10 h-56 w-56 rounded-full bg-brand/30 blur-3xl" />
                <div className="absolute top-16 -right-10 h-56 w-56 rounded-full bg-accent/40 blur-3xl" />
              </div>
              <img src="/logo.jpg" alt="" className="h-14 w-14 rounded-full" />
              <div>
                <h1 className="text-lg font-semibold text-brand">How can I help you today?</h1>
                <p className="mx-auto mt-2 max-w-md text-sm text-zinc-300">
                  Ask about token sales, whitelist/NFT mints, trends, raffles, crypto Twitter
                  sentiment/handles, or wallet holdings — get an evidence-based read on whether
                  it&apos;s worth pursuing.
                </p>
              </div>
              <div className="grid w-full max-w-lg grid-cols-2 gap-2">
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
              <PremiumRiskCheck />
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-5 py-6">
              {messages.map((message, messageIndex) => {
                const isLoadingThisMessage =
                  message.role !== 'user' && messageIndex === messages.length - 1 && status !== 'ready';
                const previousUserMessage = messageIndex > 0 ? messages[messageIndex - 1] : undefined;

                return (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    isLoading={isLoadingThisMessage}
                    previousUserMessage={previousUserMessage?.role === 'user' ? previousUserMessage : undefined}
                  />
                );
              })}
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
