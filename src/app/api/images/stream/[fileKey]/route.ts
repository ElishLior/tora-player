import { NextRequest, NextResponse } from 'next/server';
import { imagePresignWindow, servableImageContentType } from '@/lib/image-keys';
import { getDownloadPresignedUrl } from '@/lib/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lesson gallery images (originals and `thumbs/` renditions): 302 to a
 * presigned R2 URL, so image bytes go straight from R2 to the device.
 *
 * Only `images/…` keys with a raster extension are signed, and R2 is told
 * the Content-Type (never SVG/HTML). The signed URL is stable per 6-hour
 * window and carries an immutable Cache-Control override, so the browser
 * keeps the bytes cached; the redirect is cached privately for less than the
 * URL's remaining lifetime.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileKey: string }> },
) {
  const { fileKey } = await params;
  const key = decodeURIComponent(fileKey);
  const contentType = servableImageContentType(key);
  if (!contentType) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const { signingDate, expiresIn, redirectMaxAge } = imagePresignWindow(Date.now());
    const signedUrl = await getDownloadPresignedUrl(key, {
      expiresIn,
      signingDate,
      contentType,
      // Keys are never overwritten (upload keys carry a timestamp or content hash).
      cacheControl: 'public, max-age=31536000, immutable',
    });

    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: signedUrl,
        'Cache-Control': `private, max-age=${redirectMaxAge}`,
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (error) {
    console.error('Image presign error:', error);
    return NextResponse.json({ error: 'Failed to prepare image' }, { status: 500 });
  }
}
