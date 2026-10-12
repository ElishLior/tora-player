import { describe, expect, it } from 'vitest';
import { GET } from './route';
import { APP_VERSION, BUILD_ID } from '@/lib/app-version';

describe('GET /api/version', () => {
  it('returns the deployed version and build id', async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ version: APP_VERSION, buildId: BUILD_ID });
  });

  it('is never cached, so a new deploy is seen on the next check', () => {
    const response = GET();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
