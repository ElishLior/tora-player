import { NextRequest, NextResponse } from 'next/server';
import {
  buildAudioDownloadFilename,
  buildContentDisposition,
  getAudioContentType,
  getAudioExtension,
} from '@/lib/audio-download';
import { getDownloadPresignedUrl, headR2Object } from '@/lib/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The URL only has to be valid when the browser starts the request; a long
// transfer that started in time is not cut off by expiry.
const PRESIGNED_URL_TTL_SECONDS = 300;

/**
 * GET redirects to R2 so audio bytes never pass through a Vercel function;
 * HEAD returns the matching metadata without transferring audio bytes.
 *
 * - default: `Content-Disposition: attachment` with an RFC 5987 UTF-8
 *   filename (`?filename=`), for saving the file to the device.
 * - `?disposition=inline`: the raw audio with its real Content-Type, used by
 *   offline saving (fetch follows the redirect; R2 CORS allows GET).
 *
 * Only lesson audio objects (`audio/…` with an audio extension) can be signed,
 * never originals, images or arbitrary bucket keys.
 */
function audioKey(fileKey: string): string | null {
  const key = decodeURIComponent(fileKey);
  return key.startsWith('audio/') && !key.includes('..') && getAudioExtension(key) ? key : null;
}

function audioRepresentation(request: NextRequest, key: string) {
  if (request.nextUrl.searchParams.get('disposition') === 'inline') {
    return { contentType: getAudioContentType(key), contentDisposition: undefined };
  }
  return {
    contentType: 'application/octet-stream',
    contentDisposition: buildContentDisposition(
      buildAudioDownloadFilename(request.nextUrl.searchParams.get('filename') || key.split('/').pop(), key),
    ),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileKey: string }> },
) {
  const { fileKey } = await params;
  const key = audioKey(fileKey);
  if (!key) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { contentType, contentDisposition } = audioRepresentation(request, key);
  try {
    const signedUrl = await getDownloadPresignedUrl(key, {
      expiresIn: PRESIGNED_URL_TTL_SECONDS,
      contentType,
      contentDisposition,
    });

    const response = NextResponse.redirect(signedUrl, 302);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    console.error('Audio download presign error:', error);
    return NextResponse.json({ error: 'Failed to prepare download' }, { status: 500 });
  }
}

/** Podcast and download clients probe the actual representation before GET. */
export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ fileKey: string }> },
) {
  const { fileKey } = await params;
  const key = audioKey(fileKey);
  if (!key) return new Response(null, { status: 404 });

  try {
    const object = await headR2Object(key);
    if (object.ContentLength === undefined) throw new Error('R2 HEAD returned no content length');
    const { contentType, contentDisposition } = audioRepresentation(request, key);
    const headers = new Headers({
      'Content-Length': String(object.ContentLength),
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    });
    if (contentDisposition) headers.set('Content-Disposition', contentDisposition);
    if (object.ETag) headers.set('ETag', object.ETag);
    if (object.LastModified) headers.set('Last-Modified', object.LastModified.toUTCString());
    return new Response(null, { headers });
  } catch (error) {
    if (error && typeof error === 'object' && '$metadata' in error &&
      error.$metadata && typeof error.$metadata === 'object' &&
      'httpStatusCode' in error.$metadata && error.$metadata.httpStatusCode === 404) {
      return new Response(null, { status: 404 });
    }
    console.error('Audio HEAD metadata error:', error);
    return new Response(null, { status: 500 });
  }
}
