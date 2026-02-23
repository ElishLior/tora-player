import { NextRequest, NextResponse } from 'next/server';
import { requireServerSupabaseClient } from '@/lib/supabase/server';
import { getUploadPresignedUrl, generateOriginalKey, getPublicAudioUrl } from '@/lib/r2';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lessonId, fileName, contentType, fileSize, sortOrder = 0 } = body;

    if (!lessonId || !fileName || !contentType) {
      return NextResponse.json(
        { error: 'Missing required fields: lessonId, fileName, contentType' },
        { status: 400 }
      );
    }

    // Generate storage key using sort order to differentiate files
    const ext = fileName.split('.').pop() || 'mp3';
    const fileKey = `audio/${lessonId}/${sortOrder}_${Date.now()}.${ext}`;
    const originalKey = generateOriginalKey(lessonId, `${sortOrder}_${fileName}`);

    // Get presigned upload URL
    const uploadUrl = await getUploadPresignedUrl(fileKey, contentType);
    const publicUrl = getPublicAudioUrl(fileKey);

    // Create lesson_audio record
    const supabase = await requireServerSupabaseClient();
    const codec = contentType.includes('mp3') ? 'mp3'
      : contentType.includes('mp4') || contentType.includes('m4a') ? 'aac'
      : contentType.includes('ogg') ? 'ogg'
      : contentType.includes('wav') ? 'wav'
      : 'unknown';

    const { data: audioRecord, error: dbError } = await supabase
      .from('lesson_audio')
      .insert({
        lesson_id: lessonId,
        file_key: fileKey,
        audio_url: publicUrl,
        original_name: fileName,
        file_size: fileSize || 0,
        codec,
        sort_order: sortOrder,
      })
      .select()
      .single();

    if (dbError) {
      console.error('DB error creating lesson_audio:', dbError);
      // Fallback: still update lesson directly if lesson_audio table doesn't exist yet
      await supabase
        .from('lessons')
        .update({
          audio_url: publicUrl,
          audio_url_original: originalKey,
          file_size: fileSize || 0,
          codec,
        })
        .eq('id', lessonId);
    }

    return NextResponse.json({
      uploadUrl,
      fileKey,
      originalKey,
      publicUrl,
      audioRecord,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}
