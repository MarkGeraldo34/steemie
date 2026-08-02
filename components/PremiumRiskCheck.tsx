'use client';

import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useOkxWallet } from '@/lib/wallet/useOkxWallet';
import { fetchWithWalletPayment } from '@/lib/wallet/x402Payer';
import { createMarkdownComponents, type EthosByHandle } from './markdownComponents';
import { ShareButton } from './ShareButton';

type Status = 'idle' | 'paying' | 'researching' | 'done' | 'error';

interface UsageCountResponse {
  count: number;
  usesUntilReward: number;
  rewardEveryNUses: number;
  rewardAmountSteem: string;
}

export function PremiumRiskCheck() {
  const { address, connecting, connect, request } = useOkxWallet();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [report, setReport] = useState<string | null>(null);
  const [ethosByHandle, setEthosByHandle] = useState<EthosByHandle>({});
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageCountResponse | null>(null);

  const busy = status === 'paying' || status === 'researching';
  // This next check is the one that crosses the reward threshold.
  const earnsRewardNext = usage?.usesUntilReward === 1;
  const rewardEveryNUses = usage?.rewardEveryNUses ?? 10;
  const rewardAmountFormatted = usage?.rewardAmountSteem
    ? Number(usage.rewardAmountSteem).toLocaleString()
    : '10,000';

  const refreshUsage = useCallback(async () => {
    if (!address) {
      setUsage(null);
      return;
    }
    try {
      const res = await fetch(`/api/rewards/usage-count?address=${address}`);
      if (!res.ok) return;
      setUsage(await res.json());
    } catch {
      // Non-critical — the check still works without the reward hint.
    }
  }, [address]);

  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);

  const submit = async () => {
    if (!query.trim() || busy) return;

    if (!address) {
      await connect();
      return;
    }

    setError(null);
    setReport(null);
    setStatus('paying');

    try {
      const res = await fetchWithWalletPayment(
        '/api/premium-research',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) },
        address as `0x${string}`,
        request,
      );
      setStatus('researching');

      const data = (await res.json()) as { report?: string; ethosByHandle?: EthosByHandle; error?: string };
      if (!res.ok || !data.report) {
        throw new Error(data.error ?? `Request failed (HTTP ${res.status})`);
      }

      setReport(data.report);
      setEthosByHandle(data.ethosByHandle ?? {});
      setStatus('done');
      // The server increments the usage count via next/server's after(),
      // which runs just after this response was sent — give it a moment
      // before refetching so the badge doesn't read one check stale.
      setTimeout(refreshUsage, 1500);
    } catch (err) {
      setStatus('error');
      // Surface the real message rather than a blanket "wallet rejected"
      // string — PaymentDeclinedError's message IS the underlying cause
      // (a genuine wallet cancellation, or a real client-side bug), and
      // masking it made a 100%-reproducible code bug look like normal user
      // behavior.
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl rounded-2xl border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(255,255,255,0.88))] p-4 shadow-[0_24px_48px_-16px_rgba(20,22,12,0.5),0_10px_20px_-10px_rgba(20,22,12,0.35),inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-2px_3px_rgba(0,0,0,0.06)] backdrop-blur-xl">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-brand [text-shadow:0_1px_0_rgba(255,255,255,0.8)]">
          Premium Check
        </h2>
        <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-medium text-brand shadow-[inset_0_1px_2px_rgba(0,0,0,0.08),inset_0_-1px_0_rgba(255,255,255,0.6)]">
          0.07 USDT · X Layer
        </span>
      </div>
      <p className="mb-3 flex items-center gap-1.5 text-xs text-zinc-400">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5 shrink-0 text-brand drop-shadow-[0_1px_0_rgba(255,255,255,0.7)]"
        >
          <polyline points="20 12 20 22 4 22 4 12" />
          <rect x="2" y="7" width="20" height="5" />
          <line x1="12" y1="22" x2="12" y2="7" />
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7Z" />
          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z" />
        </svg>
        Every {rewardEveryNUses}th check earns {rewardAmountFormatted} STEEM.
      </p>

      {earnsRewardNext && (
        <p className="mb-3 flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
          <span aria-hidden>🎉</span>
          This will be your {usage?.rewardEveryNUses ? `${usage.rewardEveryNUses}th` : '10th'} premium
          check — you&apos;ll receive {rewardAmountFormatted} STEEM along with your report.
        </p>
      )}

      <form
        onSubmit={e => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          disabled={busy}
          placeholder="Paste a link, contract address, or describe the opportunity…"
          className="min-w-0 flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 shadow-[inset_0_1px_3px_rgba(0,0,0,0.08)] outline-none transition-colors focus:border-brand disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || connecting || !query.trim()}
          className="w-full shrink-0 rounded-full bg-[linear-gradient(180deg,#9ba064,#7d8153)] px-4 py-2 text-xs font-medium text-white shadow-[0_4px_10px_-2px_rgba(74,77,48,0.6),inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-2px_2px_rgba(0,0,0,0.15)] transition-all active:translate-y-px active:shadow-[0_2px_4px_-1px_rgba(74,77,48,0.5),inset_0_1px_3px_rgba(0,0,0,0.25)] disabled:opacity-50 disabled:active:translate-y-0 sm:w-auto"
        >
          {!address
            ? connecting
              ? 'Connecting…'
              : 'Connect wallet'
            : status === 'paying'
              ? 'Confirm in wallet…'
              : status === 'researching'
                ? 'Researching…'
                : earnsRewardNext
                  ? 'Check — 0.07 USDT (+STEEM!)'
                  : 'Check — 0.07 USDT'}
        </button>
      </form>

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {report && (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-3">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={createMarkdownComponents(ethosByHandle)}>
            {report}
          </ReactMarkdown>
          <div className="mt-3 border-t border-zinc-100 pt-3">
            <ShareButton query={query} report={report} ethosByHandle={ethosByHandle} source="premium" />
          </div>
        </div>
      )}
    </div>
  );
}
