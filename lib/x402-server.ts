import { x402ResourceServer, type RouteConfig } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { OkxFacilitatorClient } from './okx-facilitator';

const USDT0_ADDRESS = '0x779ded0c9e1022225f8e0630b35a9b54be713736';
const USDT0_DECIMALS = 6;
const PRICE_USDT = '0.07';
const PAY_TO_ADDRESS = '0xa323C97D71Aa765f44C9570b4cd1a4Eb79d23A6b';

export const x402Resource = new x402ResourceServer(new OkxFacilitatorClient()).register(
  'eip155:196',
  new ExactEvmScheme(),
);

export const premiumResearchRouteConfig: RouteConfig = {
  accepts: {
    scheme: 'exact',
    network: 'eip155:196',
    payTo: PAY_TO_ADDRESS,
    price: {
      asset: USDT0_ADDRESS,
      amount: String(Math.round(Number(PRICE_USDT) * 10 ** USDT0_DECIMALS)),
      extra: { name: 'USD₮0', version: '1' },
    },
    maxTimeoutSeconds: 300,
  },
  description: 'Premium evidence-based crypto opportunity research report',
  mimeType: 'application/json',
};
