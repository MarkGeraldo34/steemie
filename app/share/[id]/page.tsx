import type { Metadata } from 'next';
import Link from 'next/link';
import { getSharedSearch } from '@/lib/share-store';
import { SharedSearchView } from '@/components/SharedSearchView';

export async function generateMetadata(props: PageProps<'/share/[id]'>): Promise<Metadata> {
  const { id } = await props.params;
  const shared = await getSharedSearch(id);
  if (!shared) {
    return { title: 'Shared search not found — Steemie' };
  }
  const title = shared.query.length > 70 ? `${shared.query.slice(0, 70)}…` : shared.query;
  return {
    title: `${title} — Steemie`,
    description: 'A shared Steemie search result — crypto opportunity research, evidence-based.',
  };
}

export default async function SharePage(props: PageProps<'/share/[id]'>) {
  const { id } = await props.params;
  const shared = await getSharedSearch(id);

  if (!shared) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-background px-4 text-center font-sans">
        <img src="/logo.jpg" alt="" className="h-10 w-10 rounded-full" />
        <h1 className="text-base font-semibold text-brand">This shared search isn&apos;t available</h1>
        <p className="max-w-sm text-sm text-zinc-500">
          The link may have expired (shared searches are kept for 90 days) or never existed.
        </p>
        <Link
          href="/"
          className="mt-2 rounded-full border-2 border-brand/40 bg-brand/10 px-4 py-1.5 text-xs font-medium text-brand transition-opacity hover:opacity-80"
        >
          Go to Steemie →
        </Link>
      </div>
    );
  }

  return <SharedSearchView {...shared} />;
}
