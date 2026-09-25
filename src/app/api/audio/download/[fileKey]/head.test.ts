import { afterAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const previousEnv = vi.hoisted(() => {
  const previous = {
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  };
  process.env.R2_ACCOUNT_ID = 'test-account';
  process.env.R2_ACCESS_KEY_ID = 'test-access-key';
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
  return previous;
});

vi.mock('@/lib/r2', async (importOriginal) => ({
  ...(await importOriginal() as object),
  headR2Object: vi.fn(async () => ({ ContentLength: 321 })),
}));

import { GET, HEAD } from './route';

afterAll(() => {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('podcast media HEAD', () => {
  it('reports the same attachment filename and MIME type that GET will deliver', async () => {
    const fileKey = 'audio%2Flesson-1%2Fpart-1.opus';
    const url = `http://localhost/api/audio/download/${fileKey}?filename=${encodeURIComponent('פרשה.opus')}`;
    const params = { params: Promise.resolve({ fileKey }) };
    const get = await GET(new NextRequest(url), params);
    const head = await HEAD(new NextRequest(url, { method: 'HEAD' }), params);
    const getLocation = new URL(get.headers.get('Location')!);

    expect(head.status).toBe(200);
    expect(head.headers.get('Content-Length')).toBe('321');
    expect(head.headers.get('Content-Type')).toBe(getLocation.searchParams.get('response-content-type'));
    expect(head.headers.get('Content-Disposition')).toBe(getLocation.searchParams.get('response-content-disposition'));
    expect(head.headers.get('Accept-Ranges')).toBe('bytes');
    expect(head.headers.get('Cache-Control')).toBe('no-store');
  });

  it('reports inline audio MIME without an attachment filename for podcast probes', async () => {
    const fileKey = 'audio%2Flesson-1%2Fpart-1.opus';
    const url = `http://localhost/api/audio/download/${fileKey}?disposition=inline`;
    const params = { params: Promise.resolve({ fileKey }) };
    const get = await GET(new NextRequest(url), params);
    const head = await HEAD(new NextRequest(url, { method: 'HEAD' }), params);
    const getLocation = new URL(get.headers.get('Location')!);

    expect(head.status).toBe(200);
    expect(head.headers.get('Content-Type')).toBe('audio/ogg');
    expect(head.headers.get('Content-Type')).toBe(getLocation.searchParams.get('response-content-type'));
    expect(head.headers.get('Content-Disposition')).toBeNull();
    expect(head.headers.get('Content-Length')).toBe('321');
  });

  it('does not sign non-audio objects', async () => {
    const fileKey = 'images%2Fphoto.jpg';
    const response = await HEAD(new NextRequest(`http://localhost/api/audio/download/${fileKey}`, { method: 'HEAD' }), {
      params: Promise.resolve({ fileKey }),
    });
    expect(response.status).toBe(404);
  });
});
