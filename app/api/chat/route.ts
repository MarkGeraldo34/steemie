import { createAgentUIStreamResponse } from 'ai';
import { cryptoIntelAgent } from '@/lib/agents/crypto-intel-agent';

export async function POST(request: Request) {
  const { messages } = await request.json();

  return createAgentUIStreamResponse({
    agent: cryptoIntelAgent,
    uiMessages: messages,
  });
}
