import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/upload-server', () => ({
  rejectNonAdmin: vi.fn(async () => null),
  lessonExists: vi.fn(async () => true),
}));
vi.mock('@/lib/r2', () => ({
  deleteFromR2: vi.fn(async () => undefined),
  deleteR2Prefix: vi.fn(async () => undefined),
  downloadFromR2: vi.fn(),
  listR2Objects: vi.fn(),
}));
vi.mock('@/lib/r2-chunks', () => ({ assembleChunks: vi.fn(async () => 2048) }));
vi.mock('@/lib/supabase/anon', () => ({ revalidateCatalog: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabaseClient: vi.fn() }));

import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { deleteFromR2, downloadFromR2, listR2Objects } from '@/lib/r2';
import { assembleChunks } from '@/lib/r2-chunks';
import { POST } from './route';

const LESSON = '9d1f3c2a-6b7e-4a8d-9c1e-2f3a4b5c6d7e';
const UPLOAD = '5e2a1b3c-7d8e-4f90-8a1b-2c3d4e5f6a7b';
const OLD_KEY = `sources/${LESSON}/1000.pdf`;
const order: string[] = [];

function db({ previousKey, upsertError }: { previousKey: string | null; upsertError?: { message: string } }) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: previousKey ? { file_key: previousKey } : null, error: null }),
    upsert: (row: Record<string, unknown>) => {
      order.push('upsert');
      return {
        select: () => ({
          single: async () =>
            upsertError
              ? { data: null, error: upsertError }
              : { data: { ...row, updated_at: '2026-10-13T00:00:00Z' }, error: null },
        }),
      };
    },
  };
  return { from: () => builder } as never;
}

const request = (fileName = 'sources.pdf') =>
  new NextRequest('http://localhost/api/upload/source', {
    method: 'POST',
    body: JSON.stringify({ uploadId: UPLOAD, lessonId: LESSON, totalParts: 1, fileName, fileSize: 2048 }),
  });

describe('POST /api/upload/source', () => {
  beforeEach(() => {
    order.length = 0;
    vi.mocked(listR2Objects).mockResolvedValue([`_chunks/${UPLOAD}/part_0000`]);
    vi.mocked(downloadFromR2).mockResolvedValue(Buffer.from('%PDF-1.7\n...'));
    vi.mocked(assembleChunks).mockClear();
    vi.mocked(deleteFromR2).mockReset().mockImplementation(async (key: string) => {
      order.push(`delete ${key}`);
    });
  });

  it('refuses a file that is not a PDF before storing anything', async () => {
    vi.mocked(createAdminSupabaseClient).mockReturnValue(db({ previousKey: OLD_KEY }));
    vi.mocked(downloadFromR2).mockResolvedValue(Buffer.from('<html>'));
    expect((await POST(request())).status).toBe(415);
    expect((await POST(request('notes.docx'))).status).toBe(415);
    expect(assembleChunks).not.toHaveBeenCalled();
    expect(deleteFromR2).not.toHaveBeenCalled();
  });

  it('keeps the published PDF when saving the new one fails', async () => {
    vi.mocked(createAdminSupabaseClient).mockReturnValue(db({ previousKey: OLD_KEY, upsertError: { message: 'boom' } }));
    expect((await POST(request())).status).toBe(500);
    const deleted = vi.mocked(deleteFromR2).mock.calls.map(([key]) => key);
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).not.toBe(OLD_KEY);
    expect(deleted[0]).toMatch(new RegExp(`^sources/${LESSON}/\\d+\\.pdf$`));
  });

  it('publishes the new PDF, then deletes the one it replaced', async () => {
    vi.mocked(createAdminSupabaseClient).mockReturnValue(db({ previousKey: OLD_KEY }));
    const res = await POST(request());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toMatchObject({ lessonId: LESSON, status: 'ready', fileName: 'sources.pdf', fileSize: 2048 });
    expect(order).toEqual(['upsert', `delete ${OLD_KEY}`]);
  });
});
