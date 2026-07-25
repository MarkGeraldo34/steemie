import { createAgentUIStreamResponse } from 'ai';
import { cryptoIntelAgent } from '@/lib/agents/crypto-intel-agent';

// walletHoldings alone can run up to its own ~45s time budget when scanning
// every supported chain; give the route headroom beyond that plus the rest
// of the tool-call loop and streaming.
export const maxDuration = 60;

export async function POST(request: Request) {
  const { messages } = await request.json();

  return createAgentUIStreamResponse({
    agent: cryptoIntelAgent,
    uiMessages: messages,
  });
}
