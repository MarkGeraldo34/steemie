'use client';

import { useCallback, useEffect, useState } from 'react';
import type { OKXUniversalConnectUI } from '@okxconnect/ui';

const STEEMIE_ICON =
  'https://static.okx.com/cdn/web3/wallet/marketplace/headimages/agent/avatar/d7432566-80f2-4f64-bae7-d11fd72f6e52.png';

// X Layer is required, not optional: it's the only chain the x402 payment
// flow (x402Payer.ts) ever signs on. Connecting with it merely optional
// meant a wallet could grant a session with no authorization for X Layer at
// all, so the later signTypedData request on that chain had nothing to
// approve against and was rejected — this is what made "connect" succeed
// but "pay" fail.
const REQUIRED_CHAINS = ['eip155:196'];
const OPTIONAL_CHAINS = ['eip155:1', 'eip155:137', 'eip155:56', 'eip155:42161'];

let uiInitPromise: Promise<OKXUniversalConnectUI> | null = null;

function getConnectUI() {
  if (!uiInitPromise) {
    uiInitPromise = import('@okxconnect/ui').then(({ OKXUniversalConnectUI, THEME }) =>
      OKXUniversalConnectUI.init({
        dappMetaData: {
          name: 'Steemie',
          icon: STEEMIE_ICON,
        },
        actionsConfiguration: {
          returnStrategy: 'none',
          modals: 'all',
        },
        uiPreferences: {
          theme: THEME.LIGHT,
        },
      }),
    );
  }
  return uiInitPromise;
}

type SessionLike = { namespaces?: Record<string, { accounts?: string[] }> } | undefined;

function extractAddress(session: SessionLike) {
  const account = session?.namespaces?.eip155?.accounts?.[0];
  return account ? (account.split(':').pop() ?? null) : null;
}

export type WalletRequestFn = (
  args: { method: string; params?: unknown[] },
  chain?: string,
) => Promise<unknown>;

export function useOkxWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getConnectUI().then(ui => {
      if (cancelled) return;
      if (ui.connected()) {
        setAddress(extractAddress(ui.session));
      }
      ui.on('session_delete', () => setAddress(null));
      ui.on('accountChanged', (session: SessionLike) => setAddress(extractAddress(session)));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    // The underlying OKX Connect SDK registers a fresh one-shot listener on
    // its shared connect signal each time openModal() runs, with no visible
    // cleanup if a prior call is still in flight — a second concurrent call
    // can cross-wire with the first and surface as a spurious rejection.
    // This is the same reason the redundant header wallet button was
    // removed (a second independent connect() call site); guard here too so
    // no future caller can reintroduce the same race.
    if (connecting) return;
    setConnecting(true);
    setError(null);
    try {
      const ui = await getConnectUI();
      const session = await ui.openModal({
        namespaces: {
          eip155: {
            chains: REQUIRED_CHAINS,
            defaultChain: '196',
          },
        },
        optionalNamespaces: {
          eip155: {
            chains: OPTIONAL_CHAINS,
          },
        },
      });
      setAddress(extractAddress(session));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet');
    } finally {
      setConnecting(false);
    }
  }, [connecting]);

  const disconnect = useCallback(async () => {
    const ui = await getConnectUI();
    ui.disconnect();
    setAddress(null);
  }, []);

  const request = useCallback<WalletRequestFn>(async (args, chain) => {
    const ui = await getConnectUI();
    return ui.request(args, chain);
  }, []);

  return { address, connecting, error, connect, disconnect, request };
}
