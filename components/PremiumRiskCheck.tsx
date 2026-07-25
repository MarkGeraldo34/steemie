'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useOkxWallet } from '@/lib/wallet/useOkxWallet';
import { fetchWithWalletPayment } from '@/lib/wallet/x402Payer';
import { createMarkdownComponents, type EthosByHandle } from './markdownComponents';

type Status = 'idle' | 'paying' | 'researching' | 'done' | 'error';

export function PremiumRiskCheck() {
  const { address, connecting, connect, request } = useOkxWallet();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [report, setReport] = useState<string | null>(null);
  const [ethosByHandle, setEthosByHandle] = useState<EthosByHandle>({});
  const [error, setError] = useState<string | null>(null);

  const busy = status === 'paying' || status === 'researching';

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
    <div className="mx-auto w-full max-w-2xl rounded-2xl border border-brand/30 bg-brand/5 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900">Premium Risk Check</h2>
        <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-medium text-brand">
          0.07 USDT · X Layer
        </span>
      </div>
      <p className="mb-3 text-xs text-zinc-500">
        Pay per check to get a focused, evidence-based read on whether a token sale, NFT/whitelist
        mint, or raffle is worth pursuing.
      </p>

      <form
        onSubmit={e => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-2"
      >
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          disabled={busy}
          placeholder="Paste a link, contract address, or describe the opportunity…"
          className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-brand disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || connecting || !query.trim()}
          className="shrink-0 rounded-full bg-brand px-4 py-2 text-xs font-medium text-white transition-opacity disabled:opacity-50"
        >
          {!address
            ? connecting
              ? 'Connecting…'
              : 'Connect wallet'
            : status === 'paying'
              ? 'Confirm in wallet…'
              : status === 'researching'
                ? 'Researching…'
                : 'Check — 0.07 USDT'}
        </button>
      </form>

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {report && (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-3">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={createMarkdownComponents(ethosByHandle)}>
            {report}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
