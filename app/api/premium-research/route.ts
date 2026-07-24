import { NextRequest, NextResponse } from 'next/server';
import { withX402 } from '@x402/next';
import { cryptoIntelAgent } from '@/lib/agents/crypto-intel-agent';
import { x402Resource, premiumResearchRouteConfig } from '@/lib/x402-server';

/**
 * Paid alternative to /api/chat: runs the full research agent non-streaming
 * and returns the final report as JSON. Gated behind an x402 payment
 * (0.07 USDT on X Layer, verified/settled via OKX's facilitator) — the free
 * chat at /api/chat is untouched.
 */
const handler = async (
  request: NextRequest,
): Promise<NextResponse<{ report: string } | { error: string }>> => {
  const { query } = (await request.json()) as { query?: string };

  if (!query || typeof query !== 'string') {
    return NextResponse.json({ error: 'Missing "query" string in request body' }, { status: 400 });
  }

  const result = await cryptoIntelAgent.generate({ prompt: query });

  return NextResponse.json({ report: result.text });
};

export const POST = withX402(handler, premiumResearchRouteConfig, x402Resource);
