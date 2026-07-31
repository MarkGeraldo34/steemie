'use client';

import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CryptoIntelAgentUIMessage } from '@/lib/agents/crypto-intel-agent';
import { EthosScoreBadge } from './EthosScoreBadge';
import { ShareButton } from './ShareButton';
import { createMarkdownComponents, type EthosByHandle } from './markdownComponents';
import { collectEthosByHandle as collectEthosByHandleFromToolOutputs } from '@/lib/ethos-handle-map';
import type { EthosLevel } from '@/lib/ethos-api';

const TOOL_LABELS: Record<string, string> = {
  'tool-tokenSales': 'Searching token sales',
  'tool-whitelistNft': 'Searching whitelist / NFT mints',
  'tool-trends': 'Checking market trends',
  'tool-raffles': 'Searching raffles',
  'tool-riskAnalysis': 'Running due-diligence check',
  'tool-walletHoldings': 'Checking wallet holdings',
  'tool-twitterGenuineness': 'Checking account genuineness',
  'tool-twitterTweets': 'Fetching tweets',
  'tool-twitterPersonality': 'Analyzing tone & personality',
  'tool-twitterSentiment': 'Gauging sentiment',
};

/**
 * Adapts this message's UI-message tool parts (type: "tool-<name>", state,
 * output) to the {toolName, output} shape the shared extractor expects, then
 * builds the handle -> Ethos map used to turn [@handle](profileUrl) links in
 * the write-up into click-to-reveal dropdowns instead of plain links.
 */
function collectEthosByHandle(parts: CryptoIntelAgentUIMessage['parts']): EthosByHandle {
  const toolOutputs = parts
    .filter((part): part is typeof part & { state: string; output?: unknown } => part.type.startsWith('tool-'))
    .filter(part => part.state === 'output-available')
    .map(part => ({ toolName: part.type.replace(/^tool-/, ''), output: part.output }));

  return collectEthosByHandleFromToolOutputs(toolOutputs);
}

function extractText(message: CryptoIntelAgentUIMessage | undefined): string {
  if (!message) return '';
  return message.parts
    .filter((part): part is typeof part & { text: string } => part.type === 'text')
    .map(part => part.text)
    .join('\n\n');
}

type Props = {
  message: CryptoIntelAgentUIMessage;
  isLoading: boolean;
  previousUserMessage: CryptoIntelAgentUIMessage | undefined;
};

/**
 * One chat bubble. Wrapped in memo() below — during streaming, useChat keeps
 * stable object references for every message except the one actively
 * receiving tokens, so without this boundary every keystroke of a live
 * response was re-parsing markdown (ReactMarkdown does no internal memoing)
 * for the ENTIRE conversation history on every render, not just the message
 * that changed. That's what made longer conversations feel laggy.
 */
function ChatMessageInner({ message, isLoading, previousUserMessage }: Props) {
  const isUser = message.role === 'user';
  const ethosByHandle = isUser ? undefined : collectEthosByHandle(message.parts);
  const markdownComponents = ethosByHandle && createMarkdownComponents(ethosByHandle);

  const renderedParts = message.parts.map((part, i) => {
    if (part.type === 'text') {
      if (isUser) {
        return (
          <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed">
            {part.text}
          </p>
        );
      }
      return (
        <div key={i} className="animate-fade-in-up text-sm leading-relaxed">
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
        <div key={i} className="animate-fade-in-up my-1 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
            {toolPart.state === 'output-available' ? (
              <span className="mr-1.5 text-brand">✓</span>
            ) : (
              <span className="mr-1.5 inline-flex items-center gap-0.5">
                <span className="animate-pulse-dot h-1 w-1 rounded-full bg-zinc-400" />
                <span className="animate-pulse-dot h-1 w-1 rounded-full bg-zinc-400 [animation-delay:0.15s]" />
                <span className="animate-pulse-dot h-1 w-1 rounded-full bg-zinc-400 [animation-delay:0.3s]" />
              </span>
            )}
            {label}
            {toolPart.state === 'output-error' && ' (failed)'}
          </div>
          {ethosProfile && <EthosScoreBadge score={ethosProfile.ethosScore} level={ethosProfile.level} />}
        </div>
      );
    }

    return null;
  });

  const bubble =
    isUser || isLoading ? (
      renderedParts
    ) : (
      <>
        {renderedParts}
        {(() => {
          const reportText = extractText(message);
          const userQuery = extractText(previousUserMessage);
          if (!reportText.trim() || !userQuery.trim()) return null;
          return (
            <div className="mt-1.5">
              <ShareButton query={userQuery} report={reportText} ethosByHandle={ethosByHandle ?? {}} source="chat" />
            </div>
          );
        })()}
      </>
    );

  return (
    <div className={isUser ? 'flex justify-end' : 'flex items-start gap-2.5'}>
      {!isUser && (
        <img
          src="/logo.jpg"
          alt=""
          className={`mt-0.5 h-6 w-6 shrink-0 rounded-full ${isLoading ? 'animate-spin-slow' : ''}`}
        />
      )}
      <div className={isUser ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-accent px-4 py-2 text-accent-ink' : 'max-w-[85%] text-zinc-800'}>
        {bubble}
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageInner);
