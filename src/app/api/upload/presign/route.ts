import { NextRequest, NextResponse } from 'next/server';
import { getUploadPresignedUrl, getPublicAudioUrl } from '@/lib/r2';

export const runtime = 'nodejs';

/**
 * Generate a presigned PUT URL for direct browser-to-R2 upload.
 * This bypasses Vercel's 4.5MB body size limit.
 */
export async function POST(request: NextRequest) {
  try {
    const { lessonId, fileName, contentType, sortOrder = 0 } = await request.json();

    if (!lessonId || !fileName) {
      return NextResponse.json(
        { error: 'Missing required fields: lessonId, fileName' },
        { status: 400 }
      );
    }

    const ext = fileName.split('.').pop() || 'mp3';
    const fileKey = `audio/${lessonId}/${sortOrder}_${Date.now()}.${ext}`;
    const ct = contentType || 'audio/mpeg';

    const presignedUrl = await getUploadPresignedUrl(fileKey, ct);
    const publicUrl = getPublicAudioUrl(fileKey);

    return NextResponse.json({ presignedUrl, fileKey, publicUrl, contentType: ct });
  } catch (error) {
    console.error('Presign error:', error);
    return NextResponse.json(
      { error: 'Failed to generate presigned URL' },
      { status: 500 }
    );
  }
}
