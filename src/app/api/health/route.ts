import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  version: string;
  checks: {
    supabase: 'connected' | 'unconfigured' | 'error';
  };
}

export async function GET() {
  const version = process.env.npm_package_version || '0.1.0';
  const timestamp = new Date().toISOString();

  let supabaseStatus: HealthResponse['checks']['supabase'] = 'unconfigured';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      // Lightweight connectivity check - query lessons table with limit 0
      const response = await fetch(`${supabaseUrl}/rest/v1/lessons?select=id&limit=0`, {
        method: 'GET',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        signal: AbortSignal.timeout(3000),
      });

      supabaseStatus = response.ok ? 'connected' : 'error';
    } catch {
      supabaseStatus = 'error';
    }
  }

  const overallStatus = supabaseStatus === 'error' ? 'degraded' : 'ok';

  const body: HealthResponse = {
    status: overallStatus,
    timestamp,
    version,
    checks: {
      supabase: supabaseStatus,
    },
  };

  return NextResponse.json(body, {
    status: overallStatus === 'ok' ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
