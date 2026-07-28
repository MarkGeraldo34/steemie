import type { EthosByHandle } from '@/components/markdownComponents';
import type { EthosLevel } from './ethos-api';

type Lead = {
  projectHandle: { handle: string; profileUrl: string; ethosScore: number | null; ethosLevel: EthosLevel | null };
};

type ToolOutputEntry = { toolName: string; output: unknown };

/**
 * Every handle a tool call surfaced (search leads, a standalone genuineness
 * lookup, or a tweets/personality lookup), keyed by lowercased handle — lets
 * an [@handle](profileUrl) markdown link become a click-to-reveal Ethos
 * dropdown instead of a plain link. Shared between the streaming chat
 * (UI message tool parts, adapted to this {toolName, output} shape by the
 * caller) and the non-streaming premium-research route
 * (agent.generate().toolResults, which is already this shape) — the leads
 * extraction logic must stay identical between the two, or the dropdown
 * appears in one surface and not the other.
 */
export function collectEthosByHandle(toolOutputs: ToolOutputEntry[]): EthosByHandle {
  const map: EthosByHandle = {};

  const add = (
    handle: string | undefined,
    profileUrl: string | undefined,
    score: number | null,
    level: EthosLevel | null,
  ) => {
    if (!handle || !profileUrl) return;
    map[handle.toLowerCase()] = { profileUrl, ethosScore: score, ethosLevel: level };
  };

  for (const { toolName, output } of toolOutputs) {
    if (toolName === 'twitterGenuineness') {
      const o = output as {
        handle?: string;
        profileUrl?: string;
        ethos?: { profile?: { ethosScore: number; level: EthosLevel } };
      };
      add(o.handle, o.profileUrl, o.ethos?.profile?.ethosScore ?? null, o.ethos?.profile?.level ?? null);
      continue;
    }

    if (toolName === 'twitterTweets' || toolName === 'twitterPersonality') {
      // Neither tool looks up Ethos data (that's twitterGenuineness's job),
      // but the agent is instructed to link the handle it fetched the same
      // way as any other mention — add it with no score/level so the
      // dropdown still renders (as the "No Ethos data" badge) instead of
      // falling back to a plain link.
      const o = output as { handle?: string; profileUrl?: string };
      add(o.handle, o.profileUrl, null, null);
      continue;
    }

    let leads: Lead[] | undefined;
    if (toolName === 'raffles') {
      leads = (output as { raffles?: Lead[] })?.raffles;
    } else if (toolName === 'tokenSales') {
      leads = (output as { sales?: Lead[] })?.sales;
    } else if (toolName === 'whitelistNft') {
      leads = (output as { whitelistLeads?: { leads?: Lead[] } })?.whitelistLeads?.leads;
    }
    for (const lead of leads ?? []) {
      add(lead.projectHandle.handle, lead.projectHandle.profileUrl, lead.projectHandle.ethosScore, lead.projectHandle.ethosLevel);
    }
  }

  return map;
}
