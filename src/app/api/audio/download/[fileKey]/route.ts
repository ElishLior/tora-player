import { NextRequest, NextResponse } from 'next/server';
import {
  buildAudioDownloadFilename,
  buildContentDisposition,
  getAudioContentType,
  getAudioExtension,
} from '@/lib/audio-download';
import { getDownloadPresignedUrl } from '@/lib/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The URL only has to be valid when the browser starts the request; a long
// transfer that started in time is not cut off by expiry.
const PRESIGNED_URL_TTL_SECONDS = 300;

/**
 * Redirects to a short-lived presigned R2 URL so audio bytes go straight from
 * R2 to the device instead of through a Vercel function.
 *
 * - default: `Content-Disposition: attachment` with an RFC 5987 UTF-8
 *   filename (`?filename=`), for saving the file to the device.
 * - `?disposition=inline`: the raw audio with its real Content-Type, used by
 *   offline saving (fetch follows the redirect; R2 CORS allows GET).
 *
 * Only lesson audio objects (`audio/…` with an audio extension) can be signed,
 * never originals, images or arbitrary bucket keys.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileKey: string }> },
) {
  const { fileKey } = await params;
  const key = decodeURIComponent(fileKey);

  if (!key.startsWith('audio/') || key.includes('..') || !getAudioExtension(key)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const inline = request.nextUrl.searchParams.get('disposition') === 'inline';

  try {
    const signedUrl = await getDownloadPresignedUrl(key, {
      expiresIn: PRESIGNED_URL_TTL_SECONDS,
      ...(inline
        ? { contentType: getAudioContentType(key) }
        : {
            contentType: 'application/octet-stream',
            contentDisposition: buildContentDisposition(
              buildAudioDownloadFilename(
                request.nextUrl.searchParams.get('filename') || key.split('/').pop(),
                key,
              ),
            ),
          }),
    });

    const response = NextResponse.redirect(signedUrl, 302);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    console.error('Audio download presign error:', error);
    return NextResponse.json({ error: 'Failed to prepare download' }, { status: 500 });
  }
}
