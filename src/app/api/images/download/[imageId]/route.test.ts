import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/r2', () => ({
  getDownloadPresignedUrl: vi.fn(),
}));
vi.mock('@/lib/supabase/admin-lesson', () => ({
  lessonReadClient: vi.fn(),
}));
vi.mock('@/lib/auth/admin', () => ({
  isAdmin: vi.fn(async () => false),
}));

import { isAdmin } from '@/lib/auth/admin';
import { getDownloadPresignedUrl } from '@/lib/r2';
import { lessonReadClient } from '@/lib/supabase/admin-lesson';
import { GET, HEAD } from './route';

const mockedPresign = vi.mocked(getDownloadPresignedUrl);
const mockedAdmin = vi.mocked(isAdmin);
const mockedClient = vi.mocked(lessonReadClient);

const SIGNED = 'https://bucket.acc.r2.cloudflarestorage.com/images/x.jpg?X-Amz-Signature=abc';
const IMAGE_ID = '9d1f3c2a-6b7e-4a8d-9c1e-2f3a4b5c6d7e';
const OTHER_ID = '5e2a1b3c-7d8e-4f90-8a1b-2c3d4e5f6a7b';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

type Row = Record<string, unknown>;

/**
 * Stand-in for the PostgREST builder: eq filters, maybeSingle and awaiting a
 * list. It does not apply RLS, so the route's own publication check is what
 * the unpublished cases exercise.
 */
function fakeClient(tables: Record<string, Row[]>) {
  const from = vi.fn((table: string) => {
    const filters: [string, unknown][] = [];
    const rows = () => (tables[table] ?? []).filter((row) => filters.every(([column, value]) => row[column] === value));
    const builder = {
      select: () => builder,
      order: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return builder;
      },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
    };
    return builder;
  });
  return { from };
}

const PUBLISHED = { id: 'L1', title: 'שיעור: בראשית/א', slug: 'bereshit-1', is_published: true };
const DRAFT = { id: 'L2', title: 'טיוטה', slug: 'draft-1', is_published: false };

function image(overrides: Partial<Row> & { id: string; lesson: Row }): Row {
  return {
    lesson_id: overrides.lesson.id,
    file_key: 'images/L1/a.jpg',
    thumb_key: 'images/L1/thumbs/a.webp',
    sort_order: 1,
    ...overrides,
  };
}

/** IMAGE_ID is the second picture in its lesson (gallery number 2). */
function twoInLesson(): Row[] {
  return [
    image({ id: OTHER_ID, lesson: PUBLISHED, sort_order: 1, file_key: 'images/L1/first.jpg' }),
    image({ id: IMAGE_ID, lesson: PUBLISHED, sort_order: 2 }),
  ];
}

function tablesWith(images: Row[]) {
  return {
    lesson_images: images.map((row) => ({ ...row })),
  };
}

function useDb(images: Row[]) {
  const client = fakeClient(tablesWith(images));
  mockedClient.mockResolvedValue(client as never);
  return client;
}

function callGet(imageId: string) {
  return GET(new NextRequest(`http://localhost/api/images/download/${imageId}`), {
    params: Promise.resolve({ imageId }),
  });
}

function callHead(imageId: string) {
  return HEAD(new NextRequest(`http://localhost/api/images/download/${imageId}`, { method: 'HEAD' }), {
    params: Promise.resolve({ imageId }),
  });
}

function decodedFilename(disposition: string | null) {
  const encoded = /filename\*=UTF-8''(.+)$/.exec(disposition ?? '')?.[1];
  return encoded ? decodeURIComponent(encoded) : null;
}

describe('image download route', () => {
  beforeEach(() => {
    mockedPresign.mockReset();
    mockedPresign.mockResolvedValue(SIGNED);
    mockedAdmin.mockReset();
    mockedAdmin.mockResolvedValue(false);
    mockedClient.mockReset();
  });

  it('redirects a published lesson image to a presigned attachment of the original, named for the lesson', async () => {
    useDb(twoInLesson());

    const response = await callGet(IMAGE_ID);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(SIGNED);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');

    const [key, options] = mockedPresign.mock.calls[0];
    expect(key).toBe('images/L1/a.jpg');
    expect(key).not.toContain('thumbs');
    expect(options?.contentType).toBe('image/jpeg');
    expect(options?.expiresIn).toBe(300);
    expect(options?.contentDisposition).toMatch(/^attachment; filename="[^"]+"; filename\*=UTF-8''/);
    // The title's ":" and "/" become "-"; the trailing "-2" is the gallery number.
    expect(decodedFilename(options!.contentDisposition!)).toBe('שיעור- בראשית-א-2.jpg');
  });

  it('gives the ASCII fallback a readable name for a Hebrew-only title', async () => {
    useDb(twoInLesson());

    await callGet(IMAGE_ID);

    expect(mockedPresign.mock.calls[0][1]?.contentDisposition).toContain('filename="image-2.jpg"');
  });

  it('numbers the file by gallery order (sort_order, then id), not insertion order', async () => {
    useDb([
      image({ id: IMAGE_ID, lesson: PUBLISHED, sort_order: 5, file_key: 'images/L1/late.png' }),
      image({ id: OTHER_ID, lesson: PUBLISHED, sort_order: 1, file_key: 'images/L1/first.png' }),
    ]);

    await callGet(IMAGE_ID);

    const [key, options] = mockedPresign.mock.calls[0];
    expect(key).toBe('images/L1/late.png');
    expect(options?.contentType).toBe('image/png');
    expect(decodedFilename(options!.contentDisposition!)).toMatch(/-2\.png$/);
  });

  it('falls back to the slug, then to "image", when the title sanitises to nothing', async () => {
    useDb([
      image({
        id: IMAGE_ID,
        lesson: { id: 'L1', title: '  ../: ', slug: 'bereshit-1', is_published: true },
        sort_order: 1,
      }),
      image({
        id: OTHER_ID,
        lesson: { id: 'L3', title: '', slug: null, is_published: true },
        lesson_id: 'L3',
        sort_order: 1,
      }),
    ]);

    await callGet(IMAGE_ID);
    expect(decodedFilename(mockedPresign.mock.calls[0][1]!.contentDisposition!)).toBe('bereshit-1-1.jpg');

    await callGet(OTHER_ID);
    expect(decodedFilename(mockedPresign.mock.calls[1][1]!.contentDisposition!)).toBe('image-1.jpg');
  });

  it('does not serve an unpublished lesson image to a non-admin', async () => {
    useDb([image({ id: IMAGE_ID, lesson: DRAFT })]);

    const response = await callGet(IMAGE_ID);

    expect(response.status).toBe(404);
    expect(mockedPresign).not.toHaveBeenCalled();
  });

  it('serves an unpublished lesson image to an admin', async () => {
    mockedAdmin.mockResolvedValue(true);
    useDb([image({ id: IMAGE_ID, lesson: DRAFT })]);

    const response = await callGet(IMAGE_ID);

    expect(response.status).toBe(302);
    expect(mockedPresign).toHaveBeenCalledTimes(1);
  });

  it('returns 404 for an unknown image id', async () => {
    useDb([image({ id: IMAGE_ID, lesson: PUBLISHED })]);

    const response = await callGet(MISSING_ID);

    expect(response.status).toBe(404);
    expect(mockedPresign).not.toHaveBeenCalled();
  });

  it('rejects a malformed id before touching the database', async () => {
    const client = useDb([image({ id: IMAGE_ID, lesson: PUBLISHED })]);

    const response = await callGet('not-a-uuid');

    expect(response.status).toBe(404);
    expect(client.from).not.toHaveBeenCalled();
    expect(mockedPresign).not.toHaveBeenCalled();
  });

  it.each([
    ['an audio object', 'audio/L1/0_1.opus'],
    ['an SVG', 'images/L1/logo.svg'],
    ['a note image', 'user-notes/u/n/1.jpg'],
    ['a traversal key', 'images/../audio/L1/0_1.jpg'],
  ])('refuses to sign %s stored as a lesson image', async (_label, fileKey) => {
    useDb([image({ id: IMAGE_ID, lesson: PUBLISHED, file_key: fileKey })]);

    const response = await callGet(IMAGE_ID);

    expect(response.status).toBe(404);
    expect(mockedPresign).not.toHaveBeenCalled();
  });

  it('returns 500 when the presigner fails', async () => {
    mockedPresign.mockRejectedValue(new Error('R2 down'));
    useDb([image({ id: IMAGE_ID, lesson: PUBLISHED })]);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await callGet(IMAGE_ID);

    expect(response.status).toBe(500);
    errorSpy.mockRestore();
  });

  it('HEAD mirrors the GET redirect without a body', async () => {
    useDb([image({ id: IMAGE_ID, lesson: PUBLISHED })]);

    const response = await callHead(IMAGE_ID);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(SIGNED);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toBe('');
  });

  it('HEAD applies the same publication check as GET', async () => {
    useDb([image({ id: IMAGE_ID, lesson: DRAFT })]);

    const response = await callHead(IMAGE_ID);

    expect(response.status).toBe(404);
    expect(mockedPresign).not.toHaveBeenCalled();
  });
});
