import { NextRequest, NextResponse } from 'next/server';
import { requireServerSupabaseClient } from '@/lib/supabase/server';
import { getUploadPresignedUrl, generateOriginalKey, generateAudioKey, getPublicAudioUrl } from '@/lib/r2';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lessonId, fileName, contentType, fileSize } = body;

    if (!lessonId || !fileName || !contentType) {
      return NextResponse.json(
        { error: 'Missing required fields: lessonId, fileName, contentType' },
        { status: 400 }
      );
    }

    // Generate storage keys
    const originalKey = generateOriginalKey(lessonId, fileName);
    const audioKey = generateAudioKey(lessonId, 'mp3');

    // Get presigned upload URL
    const uploadUrl = await getUploadPresignedUrl(originalKey, contentType);

    // Update lesson with audio metadata
    const supabase = await requireServerSupabaseClient();
    await supabase
      .from('lessons')
      .update({
        audio_url: getPublicAudioUrl(audioKey),
        audio_url_original: originalKey,
        file_size: fileSize || 0,
        codec: contentType.includes('mp3') ? 'mp3' : contentType.includes('mp4') || contentType.includes('m4a') ? 'aac' : 'unknown',
      })
      .eq('id', lessonId);

    return NextResponse.json({
      uploadUrl,
      originalKey,
      audioKey,
      publicUrl: getPublicAudioUrl(audioKey),
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}
