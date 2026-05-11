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

  it('sets full attachment headers in download mode without forwarding range requests', async () => {
    const request = new NextRequest(
      'http://localhost/api/audio/stream/folder%2Flesson.mp3?download=1&filename=%D7%A9%D7%99%D7%A2%D7%95%D7%A8.mp3',
      { headers: { Range: 'bytes=0-10' } },
    );

    const response = await GET(request, {
      params: Promise.resolve({ fileKey: 'folder%2Flesson.mp3' }),
    });

    expect(response.status).toBe(200);
    expect(mockedGetDownloadPresignedUrl).toHaveBeenCalledWith('folder/lesson.mp3');
    expect(fetch).toHaveBeenCalledWith('https://r2.example/audio.mp3', {
      headers: {},
    });
    expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(response.headers.get('Content-Range')).toBeNull();
    expect(response.headers.get('ETag')).toBe('"test-etag"');
    expect(response.headers.get('Content-Disposition')).toContain('attachment;');
    expect(response.headers.get('Content-Disposition')).toContain("filename*=UTF-8''");
  });

  it('keeps normal streaming mode inline and forwards range requests', async () => {
    const request = new NextRequest(
      'http://localhost/api/audio/stream/lesson.m4a',
      { headers: { Range: 'bytes=0-10' } },
    );

    const response = await GET(request, {
      params: Promise.resolve({ fileKey: 'lesson.m4a' }),
    });

    expect(response.status).toBe(206);
    expect(fetch).toHaveBeenCalledWith('https://r2.example/audio.mp3', {
      headers: { Range: 'bytes=0-10' },
    });
    expect(response.headers.get('Content-Type')).toBe('audio/mp4');
    expect(response.headers.get('Content-Disposition')).toBeNull();
  });
});
