'use client';

import { useOkxWallet } from '@/lib/wallet/useOkxWallet';

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletConnectButton() {
  const { address, connecting, error, connect, disconnect } = useOkxWallet();

  if (address) {
    return (
      <button
        type="button"
        onClick={disconnect}
        title="Disconnect wallet"
        className="rounded-full border-2 border-brand/40 bg-brand/10 px-3 py-1 text-xs font-medium text-brand"
      >
        {shortenAddress(address)}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={connect}
        disabled={connecting}
        className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-ink disabled:opacity-50"
      >
        {connecting ? 'Connecting…' : 'Connect Wallet'}
      </button>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </div>
  );
}
