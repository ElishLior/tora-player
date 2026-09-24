import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/r2', () => ({
  getDownloadPresignedUrl: vi.fn(),
}));

import { getDownloadPresignedUrl } from '@/lib/r2';
import { GET } from './route';

const mockedPresign = vi.mocked(getDownloadPresignedUrl);

function callRoute(fileKey: string, query = '') {
  return GET(new NextRequest(`http://localhost/api/audio/download/${fileKey}${query}`), {
    params: Promise.resolve({ fileKey }),
  });
}

describe('audio download route', () => {
  beforeEach(() => {
    mockedPresign.mockReset();
    mockedPresign.mockResolvedValue('https://acc.r2.cloudflarestorage.com/bucket/audio/x.opus?X-Amz-Signature=abc');
  });

  it('redirects to a short-lived R2 attachment url with a UTF-8 filename and the real extension', async () => {
    const filename = encodeURIComponent('שיעור 10.12');
    const response = await callRoute('audio%2Flesson-1%2F0_1.opus', `?filename=${filename}`);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(
      'https://acc.r2.cloudflarestorage.com/bucket/audio/x.opus?X-Amz-Signature=abc',
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const [key, options] = mockedPresign.mock.calls[0];
    expect(key).toBe('audio/lesson-1/0_1.opus');
    expect(options?.expiresIn).toBeLessThanOrEqual(600);
    expect(options?.contentDisposition).toBe(
      `attachment; filename="10.12.opus"; filename*=UTF-8''%D7%A9%D7%99%D7%A2%D7%95%D7%A8%2010.12.opus`,
    );
  });

  it('signs an inline url with the audio content type for offline saving', async () => {
    const response = await callRoute('audio%2Flesson-1%2F0_1.opus', '?disposition=inline');

    expect(response.status).toBe(302);
    const [, options] = mockedPresign.mock.calls[0];
    expect(options?.contentDisposition).toBeUndefined();
    expect(options?.contentType).toBe('audio/ogg');
  });

  it.each(['originals%2Flesson-1%2Foriginal.mp3', 'images%2Flesson-1%2F0_1.jpg', 'audio%2Fnotes.txt'])(
    'refuses to sign non-audio object %s',
    async (fileKey) => {
      const response = await callRoute(fileKey);

      expect(response.status).toBe(404);
      expect(mockedPresign).not.toHaveBeenCalled();
    },
  );
});
