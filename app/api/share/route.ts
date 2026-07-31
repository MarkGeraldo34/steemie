import { NextRequest, NextResponse } from 'next/server';
import {
  saveSharedSearch,
  SHARE_QUERY_MAX_LENGTH,
  SHARE_REPORT_MAX_LENGTH,
  type SharedSearch,
} from '@/lib/share-store';
import type { EthosByHandle } from '@/components/markdownComponents';

type SharePayload = {
  query?: unknown;
  report?: unknown;
  ethosByHandle?: unknown;
  source?: unknown;
};

/**
 * Creates a shareable link for one finished search (free chat exchange or
 * paid Premium Check report) so it can be opened read-only by anyone with
 * the link, without them needing to run the search themselves. See
 * app/share/[id]/page.tsx for the read side.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as SharePayload | null;

  if (!body || typeof body.query !== 'string' || typeof body.report !== 'string') {
    return NextResponse.json({ error: 'Missing "query" or "report" string field.' }, { status: 400 });
  }
  if (body.source !== 'chat' && body.source !== 'premium') {
    return NextResponse.json({ error: '"source" must be "chat" or "premium".' }, { status: 400 });
  }
  if (body.query.length === 0 || body.report.length === 0) {
    return NextResponse.json({ error: '"query" and "report" cannot be empty.' }, { status: 400 });
  }
  if (body.query.length > SHARE_QUERY_MAX_LENGTH || body.report.length > SHARE_REPORT_MAX_LENGTH) {
    return NextResponse.json({ error: 'Query or report exceeds the size allowed for a shared link.' }, { status: 413 });
  }

  const ethosByHandle = (
    body.ethosByHandle && typeof body.ethosByHandle === 'object' ? body.ethosByHandle : {}
  ) as EthosByHandle;

  const id = await saveSharedSearch({
    query: body.query,
    report: body.report,
    ethosByHandle,
    source: body.source as SharedSearch['source'],
  });

  return NextResponse.json({ id });
}
