import { NextRequest, NextResponse } from 'next/server';
import { getDownloadPresignedUrl } from '@/lib/r2';

/**
 * Detect MIME type from file extension for images.
 */
function getContentType(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'png':               return 'image/png';
    case 'webp':              return 'image/webp';
    case 'gif':               return 'image/gif';
    case 'svg':               return 'image/svg+xml';
    default:                  return 'image/jpeg';
  }
}

/**
 * Image streaming proxy.
 * Serves lesson images from R2 via signed URLs with proper headers.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileKey: string }> }
) {
  try {
    const { fileKey } = await params;
    const decodedKey = decodeURIComponent(fileKey);

    const signedUrl = await getDownloadPresignedUrl(decodedKey);
    const contentType = getContentType(decodedKey);

    // Fetch image from R2
    const r2Response = await fetch(signedUrl);

    if (!r2Response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch image from storage' },
        { status: r2Response.status }
      );
    }

    // Build response headers
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Cache-Control', 'public, max-age=604800, stale-while-revalidate=2592000');

    const contentLength = r2Response.headers.get('Content-Length');
    if (contentLength) responseHeaders.set('Content-Length', contentLength);

    const etag = r2Response.headers.get('ETag');
    if (etag) responseHeaders.set('ETag', etag);

    return new NextResponse(r2Response.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Image stream error:', error);
    return NextResponse.json(
      { error: 'Failed to stream image' },
      { status: 500 }
    );
  }
}
