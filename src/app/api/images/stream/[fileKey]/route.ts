import { NextRequest, NextResponse } from 'next/server';
import { getDownloadPresignedUrl } from '@/lib/r2';

const IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
};

/**
 * Image streaming proxy.
 * Serves lesson images (R2 keys under `images/`) via signed URLs. Only raster
 * formats are served — never SVG/HTML, which would execute script on the app
 * origin — and responses carry nosniff + a sandboxing CSP.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileKey: string }> }
) {
  try {
    const { fileKey } = await params;
    const decodedKey = decodeURIComponent(fileKey);
    const extension = decodedKey.split('.').pop()?.toLowerCase() ?? '';

    if (!decodedKey.startsWith('images/') || decodedKey.includes('..') || /^(svgz?|xml|html?|xhtml)$/.test(extension)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const signedUrl = await getDownloadPresignedUrl(decodedKey);
    // Legacy keys with unusual extensions were always served as JPEG.
    const contentType = IMAGE_TYPES[extension] ?? 'image/jpeg';

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
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    responseHeaders.set('Content-Security-Policy', "default-src 'none'; sandbox");

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
