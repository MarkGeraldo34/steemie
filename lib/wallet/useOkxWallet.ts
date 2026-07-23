'use client';

import { useCallback, useEffect, useState } from 'react';
import type { OKXUniversalConnectUI } from '@okxconnect/ui';

const STEEMIE_ICON =
  'https://static.okx.com/cdn/web3/wallet/marketplace/headimages/agent/avatar/d7432566-80f2-4f64-bae7-d11fd72f6e52.png';

const REQUIRED_CHAINS = ['eip155:1'];
const OPTIONAL_CHAINS = ['eip155:196', 'eip155:137', 'eip155:56', 'eip155:42161'];

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

function extractAddress(session: { namespaces?: Record<string, { accounts?: string[] }> } | undefined) {
  const account = session?.namespaces?.eip155?.accounts?.[0];
  return account ? (account.split(':').pop() ?? null) : null;
}

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
      ui.on('accountChanged', session => setAddress(extractAddress(session)));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const ui = await getConnectUI();
      const session = await ui.openModal({
        namespaces: {
          eip155: {
            chains: REQUIRED_CHAINS,
            defaultChain: '1',
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
  }, []);

  const disconnect = useCallback(async () => {
    const ui = await getConnectUI();
    ui.disconnect();
    setAddress(null);
  }, []);

  return { address, connecting, error, connect, disconnect };
}
