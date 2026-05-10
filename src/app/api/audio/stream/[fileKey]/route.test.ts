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
      vi.fn(async () => new Response('audio-bytes', {
        status: 206,
        headers: {
          'Content-Length': '11',
          'Content-Range': 'bytes 0-10/100',
          ETag: '"test-etag"',
        },
      })),
    );
  });

  it('sets attachment headers in download mode and forwards range requests', async () => {
    const request = new NextRequest(
      'http://localhost/api/audio/stream/folder%2Flesson.mp3?download=1&filename=%D7%A9%D7%99%D7%A2%D7%95%D7%A8.mp3',
      { headers: { Range: 'bytes=0-10' } },
    );

    const response = await GET(request, {
      params: Promise.resolve({ fileKey: 'folder%2Flesson.mp3' }),
    });

    expect(response.status).toBe(206);
    expect(mockedGetDownloadPresignedUrl).toHaveBeenCalledWith('folder/lesson.mp3');
    expect(fetch).toHaveBeenCalledWith('https://r2.example/audio.mp3', {
      headers: { Range: 'bytes=0-10' },
    });
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(response.headers.get('Content-Range')).toBe('bytes 0-10/100');
    expect(response.headers.get('ETag')).toBe('"test-etag"');
    expect(response.headers.get('Content-Disposition')).toContain('attachment;');
    expect(response.headers.get('Content-Disposition')).toContain("filename*=UTF-8''");
  });

  it('keeps normal streaming mode inline without attachment headers', async () => {
    const request = new NextRequest('http://localhost/api/audio/stream/lesson.m4a');

    const response = await GET(request, {
      params: Promise.resolve({ fileKey: 'lesson.m4a' }),
    });

    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Type')).toBe('audio/mp4');
    expect(response.headers.get('Content-Disposition')).toBeNull();
  });
});
