import { describe, expect, it } from 'vitest';
import { runHealthChecks } from './health';

const configuredEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  R2_ACCOUNT_ID: 'account',
  R2_ACCESS_KEY_ID: 'access',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET_NAME: 'bucket',
};

function okResponse(contentRange?: string) {
  return new Response(null, {
    status: 200,
    headers: contentRange ? { 'Content-Range': contentRange } : undefined,
  });
}

describe('runHealthChecks', () => {
  it('returns degraded when Supabase is not configured', async () => {
    const result = await runHealthChecks({}, async () => okResponse());

    expect(result.httpStatus).toBe(503);
    expect(result.body.status).toBe('degraded');
    expect(result.body.checks.supabase).toBe('unconfigured');
    expect(result.body.checks.schema).toBe('skipped');
  });

  it('returns ok with schema, lesson counts, and R2 readiness when dependencies respond', async () => {
    const result = await runHealthChecks(configuredEnv, async (input) => {
      const url = String(input);
      if (url.includes('is_published=eq.true')) return okResponse('0-0/134');
      if (url.includes('/lessons?select=id')) return okResponse('0-0/134');
      return okResponse();
    });

    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe('ok');
    expect(result.body.checks.supabase).toBe('connected');
    expect(result.body.checks.schema).toBe('ok');
    expect(result.body.checks.lessons).toEqual({
      status: 'ok',
      total: 134,
      published: 134,
    });
    expect(result.body.checks.r2).toBe('configured');
  });

  it('returns degraded when a required schema check fails', async () => {
    const result = await runHealthChecks(configuredEnv, async (input) => {
      const url = String(input);
      if (url.includes('/lesson_audio?')) {
        return new Response('missing table', { status: 404 });
      }
      return okResponse('0-0/0');
    });

    expect(result.httpStatus).toBe(503);
    expect(result.body.status).toBe('degraded');
    expect(result.body.checks.schema).toBe('error');
  });

  it('returns degraded when lesson count probes fail', async () => {
    const result = await runHealthChecks(configuredEnv, async (input) => {
      const url = String(input);
      if (url === 'https://example.supabase.co/rest/v1/lessons?select=id') {
        return new Response('count failed', { status: 500 });
      }
      if (url.includes('is_published=eq.true')) return okResponse('0-0/134');
      return okResponse('0-0/134');
    });

    expect(result.httpStatus).toBe(503);
    expect(result.body.status).toBe('degraded');
    expect(result.body.checks.lessons.status).toBe('error');
    expect(result.body.checks.lessons.total).toBeNull();
    expect(result.body.checks.lessons.published).toBe(134);
  });

  it('uses the runtime default R2 bucket when R2_BUCKET_NAME is omitted', async () => {
    const envWithoutBucket = { ...configuredEnv, R2_BUCKET_NAME: undefined };

    const result = await runHealthChecks(envWithoutBucket, async (input) => {
      const url = String(input);
      if (url.includes('is_published=eq.true')) return okResponse('0-0/134');
      if (url.includes('/lessons?select=id')) return okResponse('0-0/134');
      return okResponse();
    });

    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe('ok');
    expect(result.body.checks.r2).toBe('configured');
  });

  it('returns degraded when an R2 credential is missing', async () => {
    const envWithoutR2Secret = { ...configuredEnv, R2_SECRET_ACCESS_KEY: undefined };

    const result = await runHealthChecks(envWithoutR2Secret, async (input) => {
      const url = String(input);
      if (url.includes('is_published=eq.true')) return okResponse('0-0/134');
      if (url.includes('/lessons?select=id')) return okResponse('0-0/134');
      return okResponse();
    });

    expect(result.httpStatus).toBe(503);
    expect(result.body.status).toBe('degraded');
    expect(result.body.checks.r2).toBe('unconfigured');
  });
});
