import { NextRequest, NextResponse } from 'next/server';
import { getDownloadPresignedUrl } from '@/lib/r2';

/**
 * Detect MIME type from file extension.
 * Ensures the browser's audio decoder gets the correct Content-Type.
 */
function getContentType(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp3':                return 'audio/mpeg';
    case 'm4a': case 'aac':   return 'audio/mp4';
    case 'mp4':                return 'audio/mp4';
    case 'ogg': case 'opus':  return 'audio/ogg';
    case 'wav':                return 'audio/wav';
    case 'flac':               return 'audio/flac';
    case 'webm':               return 'audio/webm';
    default:                   return 'audio/mpeg';
  }
}

/**
 * Audio streaming proxy.
 *
 * Instead of redirecting to R2 (which causes issues on iOS Safari with
 * Range requests and audio decoder hinting), we proxy the audio stream
 * back with proper headers.
 *
 * - Correct Content-Type for the browser's audio decoder
 * - Range request support for seeking
 * - Cache-Control for browser caching
 * - Accept-Ranges to advertise seeking support
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

    // Forward Range header from the client (for seeking / partial content)
    const fetchHeaders: HeadersInit = {};
    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      fetchHeaders['Range'] = rangeHeader;
    }

    // Fetch audio from R2
    const r2Response = await fetch(signedUrl, { headers: fetchHeaders });

    if (!r2Response.ok && r2Response.status !== 206) {
      return NextResponse.json(
        { error: 'Failed to fetch audio from storage' },
        { status: r2Response.status }
      );
    }

    // Build response headers
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

    // Forward content-related headers from R2
    const contentLength = r2Response.headers.get('Content-Length');
    if (contentLength) responseHeaders.set('Content-Length', contentLength);

    const contentRange = r2Response.headers.get('Content-Range');
    if (contentRange) responseHeaders.set('Content-Range', contentRange);

    // Forward ETag for caching
    const etag = r2Response.headers.get('ETag');
    if (etag) responseHeaders.set('ETag', etag);

    // Stream the audio body back to the client
    return new NextResponse(r2Response.body, {
      status: r2Response.status, // 200 for full, 206 for partial/Range
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Stream error:', error);
    return NextResponse.json(
      { error: 'Failed to stream audio' },
      { status: 500 }
    );
  }
}
