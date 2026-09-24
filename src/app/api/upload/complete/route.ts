import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { completeAudioUploadSchema } from '@/lib/validators';
import { audioFormatFor, lessonExists, rejectNonAdmin } from '@/lib/upload-server';
import {
  uploadToR2,
  downloadFromR2,
  listR2Objects,
  deleteR2Prefix,
  deleteFromR2,
  getPublicAudioUrl,
  createMultipartUpload,
  uploadPart,
  completeMultipartUpload,
  abortMultipartUpload,
  type MultipartPart,
} from '@/lib/r2';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min for large file assembly

// Files under this size are concatenated in memory; larger ones go through
// S3 multipart so memory stays at ~one part.
const SIMPLE_THRESHOLD = 10 * 1024 * 1024;
// R2/S3 minimum part size for multipart upload (except the last part)
const MIN_PART_SIZE = 5 * 1024 * 1024;

async function assembleChunks(chunkKeys: string[], fileKey: string, contentType: string, fileSize: number) {
  if (fileSize < SIMPLE_THRESHOLD) {
    const chunks: Buffer[] = [];
    for (const key of chunkKeys) chunks.push(await downloadFromR2(key));
    const completeFile = Buffer.concat(chunks);
    await uploadToR2(fileKey, completeFile, contentType);
    return completeFile.length;
  }

  const mpUploadId = await createMultipartUpload(fileKey, contentType);
  const parts: MultipartPart[] = [];
  let actualSize = 0;
  try {
    let accumulated = Buffer.alloc(0);
    for (let i = 0; i < chunkKeys.length; i++) {
      const chunkData = await downloadFromR2(chunkKeys[i]);
      actualSize += chunkData.length;
      accumulated = Buffer.concat([accumulated, chunkData]);
      if (accumulated.length >= MIN_PART_SIZE || i === chunkKeys.length - 1) {
        const partNumber = parts.length + 1;
        const etag = await uploadPart(fileKey, mpUploadId, partNumber, accumulated);
        parts.push({ ETag: etag, PartNumber: partNumber });
        accumulated = Buffer.alloc(0);
      }
    }
    await completeMultipartUpload(fileKey, mpUploadId, parts);
  } catch (error) {
    try { await abortMultipartUpload(fileKey, mpUploadId); } catch { /* already failing */ }
    throw error;
  }
  return actualSize;
}

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
        original_name: originalName ?? fileName,
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
