import { TwitterHandleLink } from './TwitterHandleLink';
import type { EthosLevel } from '@/lib/ethos-api';

const X_PROFILE_URL_RE = /^https?:\/\/(www\.)?(twitter|x)\.com\/([A-Za-z0-9_]{1,15})\/?(\?.*)?$/i;
// Matches a permalink to one specific tweet (…/status/123), as opposed to a
// bare profile link — used to render source-tweet links as a small fixed-
// label pill instead of the raw URL, which is often long enough to overflow
// or force horizontal scroll on a mobile viewport.
const X_STATUS_URL_RE = /^https?:\/\/(www\.)?(twitter|x)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d+/i;

export type EthosByHandle = Record<
  string,
  { profileUrl: string; ethosScore: number | null; ethosLevel: EthosLevel | null }
>;

/**
 * Markdown renderers for agent replies. `ethosByHandle` (keyed by lowercased
 * handle, no @) lets an [@handle](profileUrl) link rendered anywhere in the
 * write-up become a click-to-reveal Ethos dropdown instead of a plain link —
 * built from whatever tool-call leads/lookups appeared earlier in the same
 * message. A profile link for a handle with no entry in the map (or no map
 * at all) falls back to a plain styled link.
 */
export function createMarkdownComponents(ethosByHandle: EthosByHandle = {}) {
  return {
    h1: (props: React.ComponentProps<'h1'>) => <h1 className="mt-3 mb-1 text-base font-semibold first:mt-0" {...props} />,
    h2: (props: React.ComponentProps<'h2'>) => <h2 className="mt-3 mb-1 text-base font-semibold first:mt-0" {...props} />,
    h3: (props: React.ComponentProps<'h3'>) => <h3 className="mt-2 mb-1 text-sm font-semibold first:mt-0" {...props} />,
    p: (props: React.ComponentProps<'p'>) => <p className="mb-2 text-sm leading-relaxed last:mb-0" {...props} />,
    ul: (props: React.ComponentProps<'ul'>) => <ul className="mb-2 list-disc space-y-0.5 pl-5 text-sm last:mb-0" {...props} />,
    ol: (props: React.ComponentProps<'ol'>) => <ol className="mb-2 list-decimal space-y-0.5 pl-5 text-sm last:mb-0" {...props} />,
    strong: (props: React.ComponentProps<'strong'>) => <strong className="font-semibold" {...props} />,
    // The agent always renders its financial-advice/risk disclaimer as a
    // blockquote (see crypto-intel-agent.ts Communication rules) — this is
    // the styled color that gives it, regardless of the exact wording,
    // which varies response to response.
    blockquote: (props: React.ComponentProps<'blockquote'>) => (
      <blockquote className="mb-2 border-l-2 border-brand/40 pl-2 text-sm italic text-brand last:mb-0" {...props} />
    ),
    a: ({ href, children }: React.ComponentProps<'a'>) => {
      // Source-tweet permalink: fixed short label regardless of what the
      // model wrote as link text (it may be the raw URL itself), so it
      // always renders as a compact, non-wrapping pill that fits a narrow
      // screen instead of a long URL forcing the line to overflow.
      if (href && X_STATUS_URL_RE.test(href)) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mx-0.5 inline-flex max-w-full shrink-0 items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 align-middle text-xs font-medium whitespace-nowrap text-zinc-500 transition-colors hover:border-accent/40 hover:text-accent"
          >
            View post ↗
          </a>
        );
      }

      const match = href ? X_PROFILE_URL_RE.exec(href) : null;
      if (!match) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
          >
            {children}
          </a>
        );
      }

      const ethos = ethosByHandle[match[3].toLowerCase()];
      if (!ethos) {
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">
            {children}
          </a>
        );
      }

      return (
        <TwitterHandleLink profileUrl={ethos.profileUrl} ethosScore={ethos.ethosScore} ethosLevel={ethos.ethosLevel}>
          {children}
        </TwitterHandleLink>
      );
    },
    table: (props: React.ComponentProps<'table'>) => (
      <div className="mb-2 overflow-x-auto">
        <table className="w-full border-collapse text-xs" {...props} />
      </div>
    ),
    th: (props: React.ComponentProps<'th'>) => (
      <th className="border border-zinc-200 bg-zinc-50 px-2 py-1 text-left font-medium" {...props} />
    ),
    td: (props: React.ComponentProps<'td'>) => <td className="border border-zinc-200 px-2 py-1" {...props} />,
    code: (props: React.ComponentProps<'code'>) => (
      <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs" {...props} />
    ),
  };
}
