import { NextRequest, NextResponse } from 'next/server';
import { getAudioContentType } from '@/lib/audio-download';
import { getDownloadPresignedUrl } from '@/lib/r2';

export const runtime = 'nodejs';
// Streamed bodies count toward the function duration; long lessons on slow
// connections need more than the default. Browsers resume with a new Range
// request if a stream is still cut off.
export const maxDuration = 300;

/**
 * Audio streaming proxy for playback.
 *
 * Proxies instead of redirecting to R2 (redirects caused issues on iOS Safari
 * with Range requests and decoder hinting):
 * - correct Content-Type for the browser's audio decoder
 * - Range requests forwarded for seeking (206 Partial Content)
 *
 * Saving a file to the device or for offline use goes through
 * /api/audio/download instead, which redirects to R2 directly.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileKey: string }> }
) {
  try {
    const { fileKey } = await params;
    const decodedKey = decodeURIComponent(fileKey);

    const signedUrl = await getDownloadPresignedUrl(decodedKey);

    const fetchHeaders: HeadersInit = {};
    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      fetchHeaders['Range'] = rangeHeader;
    }

    const r2Response = await fetch(signedUrl, { headers: fetchHeaders });

    if (!r2Response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch audio from storage' },
        { status: r2Response.status }
      );
    }

    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', getAudioContentType(decodedKey));
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    responseHeaders.set('X-Content-Type-Options', 'nosniff');

    for (const header of ['Content-Length', 'Content-Range', 'ETag']) {
      const value = r2Response.headers.get(header);
      if (value) responseHeaders.set(header, value);
    }

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
