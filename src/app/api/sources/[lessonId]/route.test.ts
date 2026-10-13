import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/r2', () => ({ getDownloadPresignedUrl: vi.fn() }));
vi.mock('@/lib/supabase/admin-lesson', () => ({ lessonReadClient: vi.fn() }));
vi.mock('@/lib/auth/admin', () => ({ isAdmin: vi.fn(async () => false) }));

import { isAdmin } from '@/lib/auth/admin';
import { getDownloadPresignedUrl } from '@/lib/r2';
import { lessonReadClient } from '@/lib/supabase/admin-lesson';
import { GET } from './route';

const LESSON = '9d1f3c2a-6b7e-4a8d-9c1e-2f3a4b5c6d7e';
const KEY = `sources/${LESSON}/1791697880885.pdf`;
const SIGNED = 'https://bucket.acc.r2.cloudflarestorage.com/sources/x.pdf?X-Amz-Signature=abc';

function clientWith(row: Record<string, unknown> | null) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return { from: vi.fn(() => builder) } as never;
}

const ready = (published = true) => ({
  status: 'ready',
  file_key: KEY,
  file_name: 'scan.pdf',
  lesson: { title: 'Lesson', hebrew_title: 'פנימיות חיצוניות', date: '2026-10-12', is_published: published },
});

const call = (query = '') =>
  GET(new NextRequest(`http://localhost/api/sources/${LESSON}${query}`), { params: Promise.resolve({ lessonId: LESSON }) });

describe('GET /api/sources/[lessonId]', () => {
  beforeEach(() => {
    vi.mocked(getDownloadPresignedUrl).mockReset().mockResolvedValue(SIGNED);
    vi.mocked(isAdmin).mockResolvedValue(false);
  });

  it('redirects a published PDF inline, named after the lesson', async () => {
    vi.mocked(lessonReadClient).mockResolvedValue(clientWith(ready()));
    const res = await call();
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(SIGNED);
    const options = vi.mocked(getDownloadPresignedUrl).mock.calls[0][1]!;
    expect(options.contentType).toBe('application/pdf');
    expect(options.contentDisposition).toMatch(/^inline; /);
    expect(decodeURIComponent(options.contentDisposition!)).toContain('מקורות השיעור - פנימיות חיצוניות 2026-10-12.pdf');
  });

  it('asks for an attachment with ?download=1', async () => {
    vi.mocked(lessonReadClient).mockResolvedValue(clientWith(ready()));
    await call('?download=1');
    expect(vi.mocked(getDownloadPresignedUrl).mock.calls[0][1]!.contentDisposition).toMatch(/^attachment; /);
  });

  it('hides a draft lesson from visitors but serves it to admins', async () => {
    vi.mocked(lessonReadClient).mockResolvedValue(clientWith(ready(false)));
    expect((await call()).status).toBe(404);
    vi.mocked(isAdmin).mockResolvedValue(true);
    expect((await call()).status).toBe(302);
  });

  it('is 404 with no row, an expected-only row, a foreign key or a junk id', async () => {
    vi.mocked(lessonReadClient).mockResolvedValue(clientWith(null));
    expect((await call()).status).toBe(404);
    vi.mocked(lessonReadClient).mockResolvedValue(clientWith({ ...ready(), status: 'expected', file_key: null }));
    expect((await call()).status).toBe(404);
    vi.mocked(lessonReadClient).mockResolvedValue(clientWith({ ...ready(), file_key: 'audio/x/1.opus' }));
    expect((await call()).status).toBe(404);
    const junk = await GET(new NextRequest('http://localhost/api/sources/x'), { params: Promise.resolve({ lessonId: 'x' }) });
    expect(junk.status).toBe(404);
    expect(getDownloadPresignedUrl).not.toHaveBeenCalled();
  });
});
