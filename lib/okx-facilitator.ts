import crypto from 'crypto';
import type { FacilitatorClient } from '@x402/core/server';
import type { PaymentPayload, PaymentRequirements, VerifyResponse, SettleResponse, SupportedResponse } from '@x402/core/types';

/**
 * Custom x402 FacilitatorClient for OKX's facilitator (X Layer / eip155:196).
 *
 * OKX's facilitator requires authenticated requests (API Key + Secret + Passphrase),
 * unlike the public x402.org reference facilitator. @x402/core's built-in
 * HTTPFacilitatorClient supports a `createAuthHeaders` hook, but it's called once
 * with no access to the request body — insufficient for OKX's standard REST auth,
 * which signs an HMAC-SHA256 over `timestamp + method + requestPath + body` per
 * request (OKX's V5 API scheme, used consistently across all their REST APIs).
 * This class implements FacilitatorClient directly so each call is signed correctly.
 *
 * Endpoint paths and request/response shapes are inferred from public docs snippets
 * (base https://web3.okx.com, prefix /api/v6/pay/x402) plus the general x402
 * facilitator contract ({ x402Version, paymentPayload, paymentRequirements }) shared
 * by all spec-compliant facilitators — OKX's own docs domain was not reachable to
 * verify exactly. Treat the first live call as the real verification; be ready to
 * adjust path/shape based on actual error responses.
 */

const OKX_BASE_URL = 'https://web3.okx.com';
const OKX_X402_PATH = '/api/v6/pay/x402';
const X402_VERSION = 2;

function sign(prehash: string, secretKey: string): string {
  return crypto.createHmac('sha256', secretKey).update(prehash).digest('base64');
}

function buildHeaders(method: string, requestPath: string, body: string): Record<string, string> {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  if (!apiKey || !secretKey || !passphrase) {
    throw new Error('OKX_API_KEY, OKX_SECRET_KEY, and OKX_PASSPHRASE must all be set to use the OKX facilitator.');
  }
  const timestamp = new Date().toISOString();
  const signature = sign(timestamp + method + requestPath + body, secretKey);
  return {
    'OK-ACCESS-KEY': apiKey,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': passphrase,
    'Content-Type': 'application/json',
  };
}

/**
 * OKX's REST APIs universally wrap payloads as { code, msg, data }, with
 * `data` sometimes an array even for single-object responses. Unwrap that
 * envelope; treat a non-"0" code as an error even on HTTP 200.
 */
function unwrapOkxEnvelope(parsed: unknown, path: string): unknown {
  if (parsed && typeof parsed === 'object' && 'code' in parsed && 'data' in parsed) {
    const envelope = parsed as { code: string | number; msg?: string; data: unknown };
    if (String(envelope.code) !== '0') {
      throw new Error(`OKX facilitator ${path} returned error code ${envelope.code}: ${envelope.msg ?? 'no message'}`);
    }
    const data = envelope.data;
    if (Array.isArray(data) && data.length === 1) {
      return data[0];
    }
    return data;
  }
  return parsed;
}

async function okxRequest<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const bodyStr = body !== undefined ? JSON.stringify(body) : '';
  const headers = buildHeaders(method, path, bodyStr);
  const res = await fetch(`${OKX_BASE_URL}${path}`, {
    method,
    headers,
    body: method === 'POST' ? bodyStr : undefined,
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`OKX facilitator ${path} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`OKX facilitator ${path} failed: HTTP ${res.status} — ${JSON.stringify(parsed).slice(0, 300)}`);
  }
  return unwrapOkxEnvelope(parsed, path) as T;
}

export class OkxFacilitatorClient implements FacilitatorClient {
  async verify(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<VerifyResponse> {
    return okxRequest<VerifyResponse>('POST', `${OKX_X402_PATH}/verify`, {
      x402Version: X402_VERSION,
      paymentPayload,
      paymentRequirements,
    });
  }

  async settle(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<SettleResponse> {
    return okxRequest<SettleResponse>('POST', `${OKX_X402_PATH}/settle`, {
      x402Version: X402_VERSION,
      paymentPayload,
      paymentRequirements,
    });
  }

  async getSupported(): Promise<SupportedResponse> {
    return okxRequest<SupportedResponse>('GET', `${OKX_X402_PATH}/supported`);
  }
}
