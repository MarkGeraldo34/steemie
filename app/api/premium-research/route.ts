import { NextRequest, NextResponse, after } from 'next/server';
import { withX402 } from '@x402/next';
import { cryptoIntelAgent } from '@/lib/agents/crypto-intel-agent';
import { x402Resource, premiumResearchRouteConfig } from '@/lib/x402-server';
import { collectEthosByHandle } from '@/lib/ethos-handle-map';
import type { EthosByHandle } from '@/components/markdownComponents';
import { maybeRewardPremiumUse } from '@/lib/rewards/handle-premium-reward';

// The research agent runs a multi-step tool loop (X API, Ethos, Etherscan,
// Claude) that can take longer than the platform default — extend the
// function timeout so a slow-but-successful run doesn't get killed mid-flight
// after the buyer has already paid.
export const maxDuration = 60;

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
): Promise<NextResponse<{ report: string; ethosByHandle: EthosByHandle } | { error: string }>> => {
  const query = await getQuery(request);

  if (!query) {
    return NextResponse.json(
      { error: 'Missing "query" (as a URL param on GET, or JSON body field on POST)' },
      { status: 400 },
    );
  }

  const result = await cryptoIntelAgent.generate({ prompt: query });

  // Same handle -> Ethos map the free streaming chat builds from UI message
  // tool parts, built here from generate()'s aggregated toolResults instead
  // — without this, every [@handle](profileUrl) link the report emits (per
  // the agent's own "Linking account mentions" instructions) has nothing to
  // key into on the client and falls back to a plain, non-interactive link.
  const ethosByHandle = collectEthosByHandle(
    result.toolResults.map(r => ({ toolName: r.toolName, output: r.output })),
  );

  // Runs after the response is sent — the buyer already has their report by
  // the time we count this use / potentially send a reward, so it adds no
  // latency to the paid request, but the function is kept alive to finish it.
  after(() => maybeRewardPremiumUse(request));

  return NextResponse.json({ report: result.text, ethosByHandle });
};

export const GET = withX402(handler, premiumResearchRouteConfig, x402Resource);
export const POST = withX402(handler, premiumResearchRouteConfig, x402Resource);
