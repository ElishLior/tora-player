import { NextRequest, NextResponse } from 'next/server';
import { getDownloadPresignedUrl } from '@/lib/r2';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileKey: string }> }
) {
  try {
    const { fileKey } = await params;
    const decodedKey = decodeURIComponent(fileKey);

    const signedUrl = await getDownloadPresignedUrl(decodedKey);

    // Redirect to the signed URL for streaming
    return NextResponse.redirect(signedUrl);
  } catch (error) {
    console.error('Stream error:', error);
    return NextResponse.json(
      { error: 'Failed to stream audio' },
      { status: 500 }
    );
  }
}
