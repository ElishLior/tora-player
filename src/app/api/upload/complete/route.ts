import { NextRequest, NextResponse } from 'next/server';
import { requireServerSupabaseClient } from '@/lib/supabase/server';
import { uploadToR2, downloadFromR2, listR2Objects, deleteR2Prefix, generateOriginalKey, getPublicAudioUrl } from '@/lib/r2';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Assemble previously uploaded chunks from R2 and upload the complete file.
 * Then record the upload in the database.
 *
 * Flow: Download chunk objects from R2 → concatenate → upload final file → clean up → record in DB
 *
 * Chunks are stored in R2 (not /tmp) to ensure they persist across different
 * Vercel serverless function instances.
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

    // Download all chunks from R2 and concatenate
    const chunks: Buffer[] = [];
    for (const key of chunkKeys) {
      const data = await downloadFromR2(key);
      chunks.push(data);
    }
    const completeFile = Buffer.concat(chunks);

    // Upload final file to R2
    const ext = fileName.split('.').pop() || 'mp3';
    const fileKey = `audio/${lessonId}/${sortOrder}_${Date.now()}.${ext}`;
    const ct = contentType || 'audio/mpeg';

    await uploadToR2(fileKey, completeFile, ct);

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
        file_size: fileSize || completeFile.length,
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
          file_size: fileSize || completeFile.length,
          codec,
        })
        .eq('id', lessonId);
    }

    // Clean up temporary chunk objects from R2
    try {
      await deleteR2Prefix(chunkPrefix);
    } catch {
      // Non-critical — chunks will be orphaned but harmless
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
