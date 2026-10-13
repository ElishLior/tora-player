import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { revalidateCatalog } from '@/lib/supabase/anon';
import { lessonExists, rejectNonAdmin } from '@/lib/upload-server';
import { deleteFromR2, deleteR2Prefix, downloadFromR2, listR2Objects } from '@/lib/r2';
import { assembleChunks } from '@/lib/r2-chunks';
import {
  LESSON_SOURCE_COLUMNS,
  MAX_SOURCE_PDF_BYTES,
  isLessonSourceKey,
  isMissingLessonSources,
  isPdfFileName,
  isPdfHeader,
  lessonSourceFileKey,
  lessonSourceFromRow,
  type LessonSourceRow,
} from '@/lib/lesson-sources';

export const runtime = 'nodejs';
export const maxDuration = 300;

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const bodySchema = z.object({
  uploadId: uuid,
  lessonId: uuid,
  totalParts: z.number().int().min(1).max(200),
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().min(1).max(MAX_SOURCE_PDF_BYTES),
});

/**
 * Complete an admin upload of a lesson's sources PDF ("מקורות השיעור"): join the
 * chunks into a new sources/<lesson>/<ts>.pdf, point the lesson's row at it
 * (status ready), then delete the file it replaced. A failure at any step leaves
 * the previously published PDF in place. Never announces anything.
 */
export async function POST(request: NextRequest) {
  const denied = await rejectNonAdmin();
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  const { uploadId, lessonId, totalParts, fileName, fileSize } = parsed.data;
  if (!isPdfFileName(fileName)) return NextResponse.json({ error: 'not-pdf' }, { status: 415 });

  const chunkPrefix = `_chunks/${uploadId}/`;
  let newKey: string | null = null;
  try {
    if (!(await lessonExists(lessonId))) return NextResponse.json({ error: 'not-found' }, { status: 404 });

    const chunkKeys = await listR2Objects(chunkPrefix);
    if (chunkKeys.length !== totalParts) return NextResponse.json({ error: 'incomplete' }, { status: 409 });
    if (!isPdfHeader(new Uint8Array(await downloadFromR2(chunkKeys[0])).subarray(0, 8))) {
      return NextResponse.json({ error: 'not-pdf' }, { status: 415 });
    }

    const supabase = createAdminSupabaseClient();
    const previous = await supabase.from('lesson_sources').select('file_key').eq('lesson_id', lessonId).maybeSingle();
    if (previous.error) {
      const missing = isMissingLessonSources(previous.error);
      return NextResponse.json({ error: missing ? 'schema_missing' : 'failed' }, { status: missing ? 503 : 500 });
    }

    newKey = lessonSourceFileKey(lessonId);
    const size = await assembleChunks(chunkKeys, newKey, 'application/pdf', fileSize);
    if (size > MAX_SOURCE_PDF_BYTES) throw new Error('PDF larger than allowed');

    const { data, error } = await supabase
      .from('lesson_sources')
      .upsert({
        lesson_id: lessonId,
        status: 'ready',
        file_key: newKey,
        file_name: fileName,
        file_size: size,
        updated_at: new Date().toISOString(),
      })
      .select(LESSON_SOURCE_COLUMNS)
      .single();
    if (error) throw error;
    const storedKey = newKey;
    newKey = null; // Published: never delete it below.

    const oldKey = (previous.data as { file_key: string | null } | null)?.file_key;
    if (oldKey && oldKey !== storedKey && isLessonSourceKey(oldKey)) {
      await deleteFromR2(oldKey).catch((err) => console.error('Old sources PDF not deleted:', oldKey, err));
    }

    revalidateCatalog();
    return NextResponse.json({ source: lessonSourceFromRow(data as LessonSourceRow) });
  } catch (error) {
    console.error('Sources PDF upload failed:', error);
    if (newKey) await deleteFromR2(newKey).catch(() => undefined);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  } finally {
    await deleteR2Prefix(chunkPrefix).catch(() => undefined);
  }
}
