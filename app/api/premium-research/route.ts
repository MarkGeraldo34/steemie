import { NextRequest, NextResponse } from 'next/server';
import { withX402 } from '@x402/next';
import { cryptoIntelAgent } from '@/lib/agents/crypto-intel-agent';
import { x402Resource, premiumResearchRouteConfig } from '@/lib/x402-server';

/**
 * Paid alternative to /api/chat: runs the full research agent non-streaming
 * and returns the final report as JSON. Gated behind an x402 payment
 * (0.07 USDT on X Layer, verified/settled via OKX's facilitator) — the free
 * chat at /api/chat is untouched.
 *
 * Supports both GET (?query=...) and POST ({ "query": "..." }) — x402
 * clients/scanners commonly probe with a plain GET, and a route that only
 * accepts POST returns 405 instead of the expected 402 challenge on that
 * probe, which reads as "not x402-compliant" even though POST works fine.
 */
async function getQuery(request: NextRequest): Promise<string | null> {
  if (request.method === 'GET') {
    return request.nextUrl.searchParams.get('query');
  }
  const body = (await request.json().catch(() => ({}))) as { query?: string };
  return body.query ?? null;
}

const handler = async (
  request: NextRequest,
): Promise<NextResponse<{ report: string } | { error: string }>> => {
  const query = await getQuery(request);

  if (!query) {
    return NextResponse.json(
      { error: 'Missing "query" (as a URL param on GET, or JSON body field on POST)' },
      { status: 400 },
    );
  }

  const result = await cryptoIntelAgent.generate({ prompt: query });

  return NextResponse.json({ report: result.text });
};

export const GET = withX402(handler, premiumResearchRouteConfig, x402Resource);
export const POST = withX402(handler, premiumResearchRouteConfig, x402Resource);
