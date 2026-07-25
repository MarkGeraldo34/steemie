import { x402Client, x402HTTPClient } from '@x402/core/client';
import { ExactEvmScheme } from '@x402/evm';
import type { ClientEvmSigner } from '@x402/evm';
import type { WalletRequestFn } from './useOkxWallet';

const X_LAYER = 'eip155:196';

// EIP-712 message fields (value/validAfter/validBefore/nonce/deadline etc.,
// depending on the payment scheme) come through as native BigInt, which
// JSON.stringify can't serialize on its own — decimal-string is the
// standard, widely-compatible wire format for uint256-ish EIP-712 fields.
// Deep-clones rather than stringifying the whole message: OKX Connect's
// eth_signTypedData_v4 handler requires params[1] to be an OBJECT (it
// runs `isRecord(params[1])` and throws "Request params message data
// error" otherwise) — unlike the JSON-string convention most other
// wallets/dApps follow for this method.
function sanitizeBigInts<T>(value: T): T {
  if (typeof value === 'bigint') return value.toString() as unknown as T;
  if (Array.isArray(value)) return value.map(sanitizeBigInts) as unknown as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, sanitizeBigInts(v)])) as T;
  }
  return value;
}

function createSigner(address: `0x${string}`, request: WalletRequestFn): ClientEvmSigner {
  return {
    address,
    async signTypedData(message) {
      const signature = await request(
        { method: 'eth_signTypedData_v4', params: [address, sanitizeBigInts(message)] },
        X_LAYER,
      );
      return signature as `0x${string}`;
    },
  };
}

export class PaymentDeclinedError extends Error {}

// The facilitator's real rejection reason (e.g. after a correctly-signed
// payment still fails verification) comes back as `error` inside the
// Payment-Required response — encoded into a response HEADER on a 402, not
// the JSON body. A caller that only reads the body sees an empty `{}` and
// no way to tell the user why, even though the reason was right there.
const FRIENDLY_PAYMENT_ERRORS: Record<string, string> = {
  insufficient_balance:
    'Insufficient USD₮0 balance on X Layer — you need at least 0.07 USD₮0 in the connected wallet to complete this payment.',
};

function friendlyPaymentError(reason: string | undefined): string {
  if (!reason) return 'Payment was rejected after signing — the facilitator declined it.';
  return FRIENDLY_PAYMENT_ERRORS[reason] ?? reason;
}

/**
 * Fetches an x402-gated resource, paying with the connected OKX wallet on X Layer
 * if (and only if) the server responds 402. A free/already-paid response is
 * returned untouched — the wallet is never prompted unless payment is required.
 */
export async function fetchWithWalletPayment(
  url: string,
  init: RequestInit,
  address: `0x${string}`,
  request: WalletRequestFn,
): Promise<Response> {
  const first = await fetch(url, init);
  if (first.status !== 402) return first;

  const signer = createSigner(address, request);
  const httpClient = new x402HTTPClient(new x402Client().register(X_LAYER, new ExactEvmScheme(signer)));

  const body = await first
    .clone()
    .json()
    .catch(() => undefined);
  const paymentRequired = httpClient.getPaymentRequiredResponse(name => first.headers.get(name), body);

  let paymentPayload;
  try {
    paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
  } catch (err) {
    // The wallet's signTypedData rejects with a user-facing error on user cancel.
    throw new PaymentDeclinedError(err instanceof Error ? err.message : 'Payment was not completed');
  }

  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

  const second = await fetch(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...paymentHeaders },
  });

  if (second.status === 402) {
    const secondBody = await second
      .clone()
      .json()
      .catch(() => undefined);
    const rejection = httpClient.getPaymentRequiredResponse(name => second.headers.get(name), secondBody);
    throw new PaymentDeclinedError(friendlyPaymentError(rejection.error));
  }

  return second;
}
