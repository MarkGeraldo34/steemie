import type { EthosLevel } from '@/lib/ethos-api';

const LEVEL_STYLES: Record<EthosLevel, { label: string; bg: string; text: string; border?: string }> = {
  untrusted: { label: 'Untrusted', bg: '#dc2626', text: '#ffffff' },
  questionable: { label: 'Questionable', bg: '#eab308', text: '#422006' },
  neutral: { label: 'Neutral', bg: '#ffffff', text: '#111827', border: '#d1d5db' },
  known: { label: 'Known', bg: '#6b7280', text: '#ffffff' },
  established: { label: 'Established', bg: '#0891b2', text: '#ffffff' },
  reputable: { label: 'Reputable', bg: '#7c3aed', text: '#ffffff' },
  exemplary: { label: 'Exemplary', bg: '#86efac', text: '#14532d' },
  distinguished: { label: 'Distinguished', bg: '#166534', text: '#ffffff' },
  revered: { label: 'Revered', bg: '#c026d3', text: '#ffffff' },
  renowned: { label: 'Renowned', bg: '#7e22ce', text: '#ffffff' },
};

export function EthosScoreBadge({ score, level }: { score: number | null; level: EthosLevel | null }) {
  if (score === null || level === null) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-500">
        No Ethos data
      </span>
    );
  }

  const style = LEVEL_STYLES[level];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{
        backgroundColor: style.bg,
        color: style.text,
        border: style.border ? `1px solid ${style.border}` : undefined,
      }}
    >
      Ethos {score}
      <span aria-hidden="true">·</span>
      {style.label}
    </span>
  );
}
