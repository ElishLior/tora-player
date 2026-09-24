import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/r2', () => ({
  getDownloadPresignedUrl: vi.fn(),
}));

import { getDownloadPresignedUrl } from '@/lib/r2';
import { GET } from './route';

const mockedGetDownloadPresignedUrl = vi.mocked(getDownloadPresignedUrl);

describe('audio stream route', () => {
  beforeEach(() => {
    mockedGetDownloadPresignedUrl.mockReset();
    mockedGetDownloadPresignedUrl.mockResolvedValue('https://r2.example/audio.mp3');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        const hasRange = Boolean((init as { headers?: Record<string, string> } | undefined)?.headers?.Range);
        return new Response('audio-bytes', {
          status: hasRange ? 206 : 200,
          headers: {
            'Content-Length': '11',
            ...(hasRange ? { 'Content-Range': 'bytes 0-10/100' } : {}),
            ETag: '"test-etag"',
          },
        });
      }),
    );
  });

  it('forwards range requests and answers 206 with the audio content type', async () => {
    const request = new NextRequest(
      'http://localhost/api/audio/stream/audio%2Flesson.m4a',
      { headers: { Range: 'bytes=0-10' } },
    );

    const response = await GET(request, {
      params: Promise.resolve({ fileKey: 'audio%2Flesson.m4a' }),
    });

    expect(response.status).toBe(206);
    expect(mockedGetDownloadPresignedUrl).toHaveBeenCalledWith('audio/lesson.m4a');
    expect(fetch).toHaveBeenCalledWith('https://r2.example/audio.mp3', {
      headers: { Range: 'bytes=0-10' },
    });
    expect(response.headers.get('Content-Type')).toBe('audio/mp4');
    expect(response.headers.get('Content-Range')).toBe('bytes 0-10/100');
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('Content-Disposition')).toBeNull();
  });

  it('returns the full file with 200 when no range is requested', async () => {
    const request = new NextRequest('http://localhost/api/audio/stream/audio%2Flesson.opus');

    const response = await GET(request, {
      params: Promise.resolve({ fileKey: 'audio%2Flesson.opus' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('audio/ogg');
    expect(response.headers.get('Content-Length')).toBe('11');
  });

  it.each([
    ['a private note image', 'user-notes/u1/n1/photo.jpg'],
    ['an upload chunk', '_chunks/upload-1/0'],
    ['a path escaping the audio folder', 'audio/../user-notes/u1/n1/a.mp3'],
    ['a non-audio file inside the audio folder', 'audio/lesson.txt'],
  ])('refuses %s without signing it', async (_label, key) => {
    const encoded = encodeURIComponent(key);
    const response = await GET(new NextRequest(`http://localhost/api/audio/stream/${encoded}`), {
      params: Promise.resolve({ fileKey: encoded }),
    });

    expect(response.status).toBe(404);
    expect(mockedGetDownloadPresignedUrl).not.toHaveBeenCalled();
  });
});
