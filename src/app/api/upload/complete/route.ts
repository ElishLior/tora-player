import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { completeAudioUploadSchema } from '@/lib/validators';
import { audioFormatFor, lessonExists, rejectNonAdmin } from '@/lib/upload-server';
import { listR2Objects, deleteR2Prefix, deleteFromR2, getPublicAudioUrl } from '@/lib/r2';
import { assembleChunks } from '@/lib/r2-chunks';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min for large file assembly

/**
 * Assemble the chunks of an admin audio upload into audio/{lessonId}/… and
 * record it in lesson_audio with its duration, part type and sort order.
 * The lesson_audio trigger keeps lessons.duration / audio_url in sync.
 */
export async function POST(request: NextRequest) {
  const denied = await rejectNonAdmin();
  if (denied) return denied;

  const parsed = completeAudioUploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid upload request' }, { status: 400 });
  }
  const { uploadId, totalParts, lessonId, fileName, originalName, fileSize, sortOrder, duration, audioType } =
    parsed.data;
  const format = audioFormatFor(fileName);
  if (!format) {
    return NextResponse.json({ error: 'Unsupported audio format' }, { status: 415 });
  }

  const chunkPrefix = `_chunks/${uploadId}/`;
  let fileKey: string | null = null;

  try {
    if (!(await lessonExists(lessonId))) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    const chunkKeys = await listR2Objects(chunkPrefix);
    if (chunkKeys.length !== totalParts) {
      return NextResponse.json(
        { error: `Expected ${totalParts} chunks but found ${chunkKeys.length}. Please retry.` },
        { status: 409 },
      );
    }

    fileKey = `audio/${lessonId}/${sortOrder}_${Date.now()}.${format.ext}`;
    const actualSize = await assembleChunks(chunkKeys, fileKey, format.contentType, fileSize);

    const { data: audioRecord, error: dbError } = await createAdminSupabaseClient()
      .from('lesson_audio')
      .insert({
        lesson_id: lessonId,
        file_key: fileKey,
        audio_url: getPublicAudioUrl(fileKey),
        source_filename: originalName ?? fileName,
        file_size: actualSize,
        duration,
        codec: format.codec,
        sort_order: sortOrder,
        audio_type: audioType ?? null,
      })
      .select()
      .single();
    if (dbError) throw dbError;

    return NextResponse.json({ success: true, fileKey, publicUrl: audioRecord.audio_url, audioRecord });
  } catch (error) {
    console.error('Upload complete error:', error);
    if (fileKey) {
      try { await deleteFromR2(fileKey); } catch { /* nothing stored yet */ }
    }
    return NextResponse.json({ error: 'Failed to complete upload' }, { status: 500 });
  } finally {
    try { await deleteR2Prefix(chunkPrefix); } catch { /* stale chunks are harmless */ }
  }
}
