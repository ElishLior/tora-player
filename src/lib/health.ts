import { isR2RuntimeConfigured } from './r2-config';

export type DependencyStatus = 'ok' | 'degraded';

export interface HealthBody {
  status: DependencyStatus;
  timestamp: string;
  version: string;
  checks: {
    supabase: 'connected' | 'unconfigured' | 'error';
    schema: 'ok' | 'skipped' | 'error';
    lessons: {
      status: 'skipped' | 'ok' | 'error';
      total: number | null;
      published: number | null;
    };
    r2: 'configured' | 'unconfigured';
  };
}

export interface HealthResult {
  httpStatus: 200 | 503;
  body: HealthBody;
}

type HealthEnv = Partial<Record<string, string | undefined>>;
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const REQUIRED_SCHEMA_CHECKS = [
  '/rest/v1/lessons?select=id&limit=0',
  '/rest/v1/lesson_audio?select=id&limit=0',
  '/rest/v1/lesson_images?select=id&limit=0',
  '/rest/v1/categories?select=id&limit=0',
  '/rest/v1/snippets?select=id&limit=0',
  '/rest/v1/playback_progress?select=id&limit=0',
  '/rest/v1/lessons?select=id,category_id,hebrew_date,parsha,lesson_type,seder_number&limit=0',
] as const;

function withTimeout(): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(3000)
    : undefined;
}

function parseCount(contentRange: string | null): number | null {
  if (!contentRange) return null;
  const total = contentRange.split('/').pop();
  if (!total || total === '*') return null;
  const parsed = Number(total);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function runHealthChecks(
  env: HealthEnv = process.env,
  fetcher: Fetcher = fetch,
): Promise<HealthResult> {
  const version = env.npm_package_version || '0.1.0';
  const timestamp = new Date().toISOString();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const r2 = isR2RuntimeConfigured(env) ? 'configured' : 'unconfigured';

  const checks: HealthBody['checks'] = {
    supabase: 'unconfigured',
    schema: 'skipped',
    lessons: {
      status: 'skipped',
      total: null,
      published: null,
    },
    r2,
  };

  if (supabaseUrl && supabaseKey) {
    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    };

    try {
      const connectivity = await fetcher(`${supabaseUrl}/rest/v1/lessons?select=id&limit=0`, {
        method: 'GET',
        headers,
        signal: withTimeout(),
      });

      if (connectivity.ok) {
        checks.supabase = 'connected';
      } else {
        checks.supabase = 'error';
      }
    } catch {
      checks.supabase = 'error';
    }

    if (checks.supabase === 'connected') {
      checks.schema = 'ok';

      for (const path of REQUIRED_SCHEMA_CHECKS) {
        try {
          const response = await fetcher(`${supabaseUrl}${path}`, {
            method: 'GET',
            headers,
            signal: withTimeout(),
          });
          if (!response.ok) {
            checks.schema = 'error';
            break;
          }
        } catch {
          checks.schema = 'error';
          break;
        }
      }

      if (checks.schema === 'ok') {
        const countHeaders = {
          ...headers,
          Prefer: 'count=exact',
          'Range-Unit': 'items',
          Range: '0-0',
        };

        try {
          const [total, published] = await Promise.all([
            fetcher(`${supabaseUrl}/rest/v1/lessons?select=id`, {
              method: 'GET',
              headers: countHeaders,
              signal: withTimeout(),
            }),
            fetcher(`${supabaseUrl}/rest/v1/lessons?select=id&is_published=eq.true`, {
              method: 'GET',
              headers: countHeaders,
              signal: withTimeout(),
            }),
          ]);

          const totalCount = total.ok ? parseCount(total.headers.get('Content-Range')) : null;
          const publishedCount = published.ok
            ? parseCount(published.headers.get('Content-Range'))
            : null;

          checks.lessons.total = totalCount;
          checks.lessons.published = publishedCount;
          checks.lessons.status =
            total.ok && published.ok && totalCount !== null && publishedCount !== null
              ? 'ok'
              : 'error';
        } catch {
          checks.lessons.status = 'error';
        }
      }
    }
  }

  const status: DependencyStatus =
    checks.supabase === 'connected' &&
    checks.schema === 'ok' &&
    checks.lessons.status === 'ok' &&
    checks.r2 === 'configured'
      ? 'ok'
      : 'degraded';

  return {
    httpStatus: status === 'ok' ? 200 : 503,
    body: {
      status,
      timestamp,
      version,
      checks,
    },
  };
}
