import { x402Client, x402HTTPClient } from '@x402/core/client';
import { ExactEvmScheme } from '@x402/evm';
import type { ClientEvmSigner } from '@x402/evm';
import type { WalletRequestFn } from './useOkxWallet';

const X_LAYER = 'eip155:196';

// EIP-712 message fields (value/validAfter/validBefore/nonce/deadline etc.,
// depending on the payment scheme) come through as native BigInt, which
// JSON.stringify can't serialize on its own. Deep-clones rather than
// stringifying the whole message: OKX Connect's eth_signTypedData_v4
// handler requires params[1] to be an OBJECT (it runs isRecord(params[1])
// and throws "Request params message data error" otherwise) — unlike the
// JSON-string convention most other wallets/dApps follow for this method.
//
// Encodes as a plain JS number, not a decimal string, whenever the value
// safely fits: a JSON number is unambiguous (every compliant EIP-712 signer
// parses it as a number and ABI-encodes it per the declared uint256 type),
// whereas a bare decimal string was empirically observed to break signing
// against the real OKX wallet — the facilitator's own verify call reported
// "Signature verification failed" / invalid_signature even though `payer`
// correctly matched the connected address, meaning the wallet's signer
// hashed the struct differently than the facilitator did for that string
// value. Our field values (USDT0 amounts, unix timestamps) are always far
// under Number.MAX_SAFE_INTEGER, so the string fallback below is a safety
// net that should never actually trigger here.
function sanitizeBigInts<T>(value: T): T {
  if (typeof value === 'bigint') {
    return (value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString()) as unknown as T;
  }
  if (Array.isArray(value)) return value.map(sanitizeBigInts) as unknown as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, sanitizeBigInts(v)])) as T;
  }
  return value;
}

// Canonical EIP-712 domain field order/types per the spec. @x402/evm's
// signTypedData callers never include an explicit `types.EIP712Domain`
// entry — lenient signers (viem, MetaMask, ethers) auto-derive it from the
// domain object's own keys, but that's an implementation courtesy, not a
// spec requirement: EIP-712 says the JSON payload SHOULD declare it. A
// stricter/native signer (plausibly what a mobile wallet app uses under
// the hood, as opposed to the browser-JS libraries every earlier test in
// this debugging session went through) could derive an incomplete or
// differently-ordered domain hash without it — computing a different
// struct hash than the facilitator, which would explain a signature that
// looks well-formed but doesn't recover to the signing address.
const DOMAIN_FIELD_TYPES: Record<string, string> = {
  name: 'string',
  version: 'string',
  chainId: 'uint256',
  verifyingContract: 'address',
  salt: 'bytes32',
};

function withExplicitDomainType(message: {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
}) {
  if (message.types.EIP712Domain) return message;
  const EIP712Domain = Object.keys(message.domain)
    .filter(key => key in DOMAIN_FIELD_TYPES)
    .map(name => ({ name, type: DOMAIN_FIELD_TYPES[name] }));
  return { ...message, types: { EIP712Domain, ...message.types } };
}

function createSigner(address: `0x${string}`, request: WalletRequestFn): ClientEvmSigner {
  return {
    address,
    async signTypedData(message) {
      const wireMessage = withExplicitDomainType(sanitizeBigInts(message));
      const signature = await request({ method: 'eth_signTypedData_v4', params: [address, wireMessage] }, X_LAYER);
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
