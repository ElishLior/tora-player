import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/r2', () => ({
  getDownloadPresignedUrl: vi.fn(),
}));

import { getDownloadPresignedUrl } from '@/lib/r2';
import { GET } from './route';

const mockedPresign = vi.mocked(getDownloadPresignedUrl);
const SIGNED = 'https://bucket.acc.r2.cloudflarestorage.com/images/x.webp?X-Amz-Signature=abc';

function callRoute(fileKey: string) {
  return GET(new NextRequest(`http://localhost/api/images/stream/${fileKey}`), {
    params: Promise.resolve({ fileKey }),
  });
}

describe('image stream route', () => {
  beforeEach(() => {
    mockedPresign.mockReset();
    mockedPresign.mockResolvedValue(SIGNED);
  });

  it('redirects a thumbnail to a presigned R2 url with its image type and an immutable byte cache', async () => {
    const response = await callRoute('images%2Flesson-1%2Fthumbs%2F0_1.webp');

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(SIGNED);
    const [key, options] = mockedPresign.mock.calls[0];
    expect(key).toBe('images/lesson-1/thumbs/0_1.webp');
    expect(options?.contentType).toBe('image/webp');
    expect(options?.cacheControl).toContain('immutable');
    const maxAge = Number(/private, max-age=(\d+)/.exec(response.headers.get('Cache-Control') ?? '')?.[1]);
    expect(maxAge).toBeGreaterThan(0);
    expect(maxAge).toBeLessThan(options!.expiresIn!);
  });

  it.each(['audio%2Flesson-1%2F0_1.opus', 'images%2F..%2Faudio%2Fx.jpg', 'images%2Flesson-1%2Fx.svg', 'user-notes%2Fu%2Fn%2F1.jpg'])(
    'refuses to sign %s',
    async (fileKey) => {
      const response = await callRoute(fileKey);

      expect(response.status).toBe(404);
      expect(mockedPresign).not.toHaveBeenCalled();
    },
  );
});
