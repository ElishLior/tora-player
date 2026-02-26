import { NextRequest, NextResponse } from 'next/server';
import { requireServerSupabaseClient } from '@/lib/supabase/server';
import {
  uploadToR2,
  downloadFromR2,
  listR2Objects,
  deleteR2Prefix,
  deleteFromR2,
  generateOriginalKey,
  getPublicAudioUrl,
  createMultipartUpload,
  uploadPart,
  completeMultipartUpload,
  abortMultipartUpload,
  type MultipartPart,
} from '@/lib/r2';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min for large file assembly

// Threshold: files under this size use simple Buffer.concat (fast path)
// Files above this use S3 Multipart Upload (memory-safe path)
const SIMPLE_THRESHOLD = 10 * 1024 * 1024; // 10 MB

// R2/S3 minimum part size for multipart upload (except last part)
const MIN_PART_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Assemble previously uploaded chunks from R2 and upload the complete file.
 * Then record the upload in the database.
 *
 * Two paths:
 * - Fast path (< 10MB): Download all chunks → Buffer.concat → single PutObject
 * - Large file path (≥ 10MB): S3 Multipart Upload — stream chunks as parts
 *   Max memory usage: ~7MB (one accumulated buffer) instead of entire file
 */
export async function POST(request: NextRequest) {
  let chunkPrefix: string | null = null;

  try {
    const {
      uploadId,
      totalParts,
      lessonId,
      fileName,
      contentType,
      fileSize,
      sortOrder = 0,
    } = await request.json();

    if (!uploadId || !lessonId || !fileName) {
      return NextResponse.json(
        { error: 'Missing required fields: uploadId, lessonId, fileName' },
        { status: 400 }
      );
    }

    chunkPrefix = `_chunks/${uploadId}/`;

    // List all chunk objects in R2
    const chunkKeys = await listR2Objects(chunkPrefix);

    if (chunkKeys.length === 0) {
      return NextResponse.json(
        { error: 'No chunks found. Upload may have expired — please retry.' },
        { status: 404 }
      );
    }

    if (totalParts && chunkKeys.length !== totalParts) {
      return NextResponse.json(
        { error: `Expected ${totalParts} chunks but found ${chunkKeys.length}. Please retry.` },
        { status: 400 }
      );
    }

    // Determine final file key
    const ext = fileName.split('.').pop() || 'mp3';
    const fileKey = `audio/${lessonId}/${sortOrder}_${Date.now()}.${ext}`;
    const ct = contentType || 'audio/mpeg';

    // Estimate total size from chunk count (each chunk ~3.5MB)
    const estimatedSize = fileSize || chunkKeys.length * 3.5 * 1024 * 1024;

    let actualFileSize: number;

    if (estimatedSize < SIMPLE_THRESHOLD) {
      // ═══ FAST PATH: small files — Buffer.concat ═══
      const chunks: Buffer[] = [];
      for (const key of chunkKeys) {
        const data = await downloadFromR2(key);
        chunks.push(data);
      }
      const completeFile = Buffer.concat(chunks);
      actualFileSize = completeFile.length;
      await uploadToR2(fileKey, completeFile, ct);

      // Clean up chunks
      try { await deleteR2Prefix(chunkPrefix); } catch { /* non-critical */ }
    } else {
      // ═══ LARGE FILE PATH: S3 Multipart Upload ═══
      // Stream chunks as parts — max ~7MB in memory at any time
      const mpUploadId = await createMultipartUpload(fileKey, ct);
      const parts: MultipartPart[] = [];

      try {
        let partNumber = 1;
        let accumulated = Buffer.alloc(0);
        actualFileSize = 0;

        for (let i = 0; i < chunkKeys.length; i++) {
          // Download one chunk (~3.5MB)
          const chunkData = await downloadFromR2(chunkKeys[i]);
          actualFileSize += chunkData.length;

          // Accumulate
          accumulated = Buffer.concat([accumulated, chunkData]);

          // Delete the chunk from R2 immediately to free storage
          try { await deleteFromR2(chunkKeys[i]); } catch { /* non-critical */ }

          const isLastChunk = i === chunkKeys.length - 1;

          // Send as part when: accumulated >= 5MB OR this is the last chunk
          if (accumulated.length >= MIN_PART_SIZE || isLastChunk) {
            const etag = await uploadPart(fileKey, mpUploadId, partNumber, accumulated);
            parts.push({ ETag: etag, PartNumber: partNumber });
            partNumber++;
            accumulated = Buffer.alloc(0); // release memory
          }
        }

        // Complete the multipart upload
        await completeMultipartUpload(fileKey, mpUploadId, parts);
      } catch (mpError) {
        // Abort multipart upload on failure
        console.error('Multipart upload failed, aborting:', mpError);
        try { await abortMultipartUpload(fileKey, mpUploadId); } catch { /* ignore */ }
        // Clean up remaining chunks
        try { await deleteR2Prefix(chunkPrefix); } catch { /* ignore */ }
        throw mpError;
      }

      // Clean up any remaining chunks (some may already be deleted)
      try { await deleteR2Prefix(chunkPrefix); } catch { /* non-critical */ }
    }

    const publicUrl = getPublicAudioUrl(fileKey);
    const originalKey = generateOriginalKey(lessonId, `${sortOrder}_${fileName}`);

    // Record in database
    const supabase = await requireServerSupabaseClient();
    const ctLower = ct.toLowerCase();
    const extLower = ext.toLowerCase();
    const codec = (ctLower.includes('mp3') || ctLower.includes('mpeg') || extLower === 'mp3') ? 'mp3'
      : (ctLower.includes('mp4') || ctLower.includes('m4a') || extLower === 'm4a') ? 'aac'
      : (ctLower.includes('ogg') || ctLower.includes('opus') || extLower === 'opus' || extLower === 'ogg') ? 'opus'
      : (ctLower.includes('wav') || extLower === 'wav') ? 'wav'
      : (ctLower.includes('flac') || extLower === 'flac') ? 'flac'
      : 'unknown';

    const { data: audioRecord, error: dbError } = await supabase
      .from('lesson_audio')
      .insert({
        lesson_id: lessonId,
        file_key: fileKey,
        audio_url: publicUrl,
        original_name: fileName,
        file_size: fileSize || actualFileSize,
        codec,
        sort_order: sortOrder,
      })
      .select()
      .single();

    if (dbError) {
      console.error('DB error creating lesson_audio:', dbError);
      // Fallback: update lesson directly
      await supabase
        .from('lessons')
        .update({
          audio_url: publicUrl,
          audio_url_original: originalKey,
          file_size: fileSize || actualFileSize,
          codec,
        })
        .eq('id', lessonId);
    }

    return NextResponse.json({
      success: true,
      fileKey,
      publicUrl,
      audioRecord,
    });
  } catch (error) {
    console.error('Upload complete error:', error);

    // Try to clean up chunks
    if (chunkPrefix) {
      try { await deleteR2Prefix(chunkPrefix); } catch { /* ignore */ }
    }

    return NextResponse.json(
      { error: 'Failed to complete upload' },
      { status: 500 }
    );
  }
}
