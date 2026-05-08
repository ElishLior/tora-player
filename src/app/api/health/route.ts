import { NextResponse } from 'next/server';
import { runHealthChecks } from '@/lib/health';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await runHealthChecks();

  return NextResponse.json(result.body, {
    status: result.httpStatus,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
