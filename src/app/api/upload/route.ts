import { NextRequest, NextResponse } from 'next/server';
import { requireServerSupabaseClient } from '@/lib/supabase/server';
import { uploadToR2, generateOriginalKey, getPublicAudioUrl } from '@/lib/r2';

export const runtime = 'nodejs';

// Allow larger uploads (Vercel Hobby: 4.5MB, Pro: 100MB)
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const lessonId = formData.get('lessonId') as string;
    const fileName = formData.get('fileName') as string;
    const contentType = formData.get('contentType') as string;
    const fileSize = Number(formData.get('fileSize') || 0);
    const sortOrder = Number(formData.get('sortOrder') || 0);

    if (!lessonId || !fileName || !file) {
      return NextResponse.json(
        { error: 'Missing required fields: lessonId, fileName, file' },
        { status: 400 }
      );
    }

    // Generate storage key
    const ext = fileName.split('.').pop() || 'mp3';
    const fileKey = `audio/${lessonId}/${sortOrder}_${Date.now()}.${ext}`;
    const originalKey = generateOriginalKey(lessonId, `${sortOrder}_${fileName}`);

    // Upload file directly to R2 (server-side, no CORS issues)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await uploadToR2(fileKey, buffer, contentType || file.type || 'audio/mpeg');

    const publicUrl = getPublicAudioUrl(fileKey);

    // Create lesson_audio record
    const supabase = await requireServerSupabaseClient();
    const ct = (contentType || '').toLowerCase();
    const extLower = ext.toLowerCase();
    const codec = (ct.includes('mp3') || ct.includes('mpeg') || extLower === 'mp3') ? 'mp3'
      : (ct.includes('mp4') || ct.includes('m4a') || extLower === 'm4a') ? 'aac'
      : (ct.includes('ogg') || ct.includes('opus') || extLower === 'opus' || extLower === 'ogg') ? 'opus'
      : (ct.includes('wav') || extLower === 'wav') ? 'wav'
      : (ct.includes('flac') || extLower === 'flac') ? 'flac'
      : 'unknown';

    const { data: audioRecord, error: dbError } = await supabase
      .from('lesson_audio')
      .insert({
        lesson_id: lessonId,
        file_key: fileKey,
        audio_url: publicUrl,
        original_name: fileName,
        file_size: fileSize || buffer.length,
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
          file_size: fileSize || buffer.length,
          codec,
        })
        .eq('id', lessonId);
    }

    return NextResponse.json({
      fileKey,
      originalKey,
      publicUrl,
      audioRecord,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
