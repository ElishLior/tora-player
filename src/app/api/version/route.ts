import { NextResponse } from 'next/server';
import { APP_VERSION, BUILD_ID } from '@/lib/app-version';

/**
 * The deployed build's identity. The running app compares its own BUILD_ID
 * with this to offer a refresh (src/lib/app-update.ts). Never cached: a cached
 * answer would hide a new deploy.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ version: APP_VERSION, buildId: BUILD_ID }, { headers: { 'Cache-Control': 'no-store' } });
}
