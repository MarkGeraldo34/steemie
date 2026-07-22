import { tool } from 'ai';
import { z } from 'zod';
import { SUPPORTED_CHAINS, ETHERSCAN_CHAIN_IDS } from '../chains';

type EtherscanSourceCodeResult = {
  SourceCode: string;
  ABI: string;
  ContractName: string;
  Proxy: string;
  Implementation: string;
};

/**
 * Live source (contract verification only): Etherscan's unified V2 API
 * (https://api.etherscan.io/v2/api), which covers Ethereum, BSC, Polygon,
 * Arbitrum, Base, Optimism, and Avalanche through one key. Requires
 * ETHERSCAN_API_KEY — get one free at https://etherscan.io/apis.
 *
 * Everything else in `evidence` is still stubbed:
 *  - audit status: no free API for audit registries (CertiK, etc.)
 *  - liquidity lock: requires on-chain LP lock scanner integration
 *  - holder concentration: Etherscan's token holder list is a paid-tier feature
 *  - deployer history / team doxx / social authenticity: need dedicated
 *    investigative tooling, not a single API call
 *
 * This tool returns raw evidence fields only. It intentionally does NOT
 * compute a verdict — the agent synthesizes the verdict from evidence so
 * the reasoning stays inspectable rather than hidden in tool code.
 */
export const riskAnalysisTool = tool({
  description:
    'Gather due-diligence evidence for a specific token sale, NFT mint, or project: contract verification (live), plus audit status, liquidity lock, holder concentration, deployer history, team transparency, and social authenticity signals (stubbed).',
  inputSchema: z.object({
    projectName: z.string(),
    contractAddress: z.string().optional(),
    chain: z.enum(SUPPORTED_CHAINS).default('ethereum'),
    officialUrl: z.string().optional(),
  }),
  execute: async ({ projectName, contractAddress, chain, officialUrl }) => {
    const evidence = {
      contractVerified: null as boolean | null,
      contractName: null as string | null,
      isProxyContract: null as boolean | null,
      auditStatus: null as string | null,
      liquidityLocked: null as boolean | null,
      liquidityLockDurationDays: null as number | null,
      topHolderConcentrationPct: null as number | null,
      deployerPriorProjects: null as string[] | null,
      teamDoxxed: null as boolean | null,
      socialAuthenticitySignal: null as string | null,
    };

    let contractCheck: { source: string; note: string; error?: string };

    const apiKey = process.env.ETHERSCAN_API_KEY;

    if (!contractAddress) {
      contractCheck = {
        source: 'etherscan-v2',
        note: 'No contractAddress provided, skipped contract verification check.',
      };
    } else if (!apiKey) {
      contractCheck = {
        source: 'stub-no-live-data',
        note: 'ETHERSCAN_API_KEY is not set. Add it to .env.local (free key at https://etherscan.io/apis) to enable live contract verification checks.',
      };
    } else {
      try {
        const chainId = ETHERSCAN_CHAIN_IDS[chain];
        const url = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=contract&action=getsourcecode&address=${contractAddress}&apikey=${apiKey}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        const data = (await res.json()) as {
          status: string;
          message: string;
          result: EtherscanSourceCodeResult[] | string;
        };

        if (data.status !== '1' || typeof data.result === 'string') {
          contractCheck = {
            source: 'etherscan-v2',
            note: 'Etherscan API returned an error rather than contract data.',
            error: typeof data.result === 'string' ? data.result : data.message,
          };
        } else {
          const result = data.result[0];
          evidence.contractVerified = result.SourceCode.length > 0;
          evidence.contractName = result.ContractName || null;
          evidence.isProxyContract = result.Proxy === '1';
          contractCheck = {
            source: 'etherscan-v2',
            note: 'Contract verification status is live. Audit status is separate from verification — a verified contract is not automatically audited or safe.',
          };
        }
      } catch (err) {
        contractCheck = {
          source: 'etherscan-v2',
          note: 'Contract verification check failed.',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return {
      subject: {
        projectName,
        contractAddress: contractAddress ?? null,
        chain,
        officialUrl: officialUrl ?? null,
      },
      contractCheck,
      evidence,
      unverifiedFields: {
        note: 'auditStatus, liquidityLocked*, topHolderConcentrationPct, deployerPriorProjects, teamDoxxed, and socialAuthenticitySignal have no live data source wired up yet. Treat them as unknown, not as evidence of safety.',
      },
    };
  },
});
