import { NextRequest, NextResponse } from 'next/server';
import { getSignedInClient } from '@/lib/account/server';
import { noteImagePrefix } from '@/lib/note-rules';
import { deleteFromR2, getDownloadPresignedUrl } from '@/lib/r2';
import { UUID_RE } from '@/lib/upload-server';

export const runtime = 'nodejs';

type Params = { params: Promise<{ imageId: string }> };

/** Presigned URLs outlive the cached redirect, so a cached redirect never points at an expired URL. */
const PRESIGN_SECONDS = 600;
const REDIRECT_CACHE_SECONDS = 300;

/** The caller's own image row (RLS), or null. Keys outside the owner's prefix are never trusted. */
async function findOwnImage(imageId: string) {
  const session = await getSignedInClient();
  if (!session) return { status: 401 as const };
  if (!UUID_RE.test(imageId)) return { status: 404 as const };

  const { data, error } = await session.supabase
    .from('lesson_note_images')
    .select('id, file_key, content_type')
    .eq('id', imageId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !(data.file_key as string).startsWith(noteImagePrefix(session.userId))) {
    return { status: 404 as const };
  }
  return { status: 200 as const, session, image: data as { id: string; file_key: string; content_type: string } };
}

/**
 * Serves a note image to its owner: 302 to a short-lived presigned R2 URL
 * (bytes never pass through the function). Never publicly cacheable.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const found = await findOwnImage((await params).imageId);
    if (found.status !== 200) {
      return NextResponse.json({ error: 'not_found' }, { status: found.status, headers: { 'Cache-Control': 'private, no-store' } });
    }
    const url = await getDownloadPresignedUrl(found.image.file_key, {
      expiresIn: PRESIGN_SECONDS,
      contentType: found.image.content_type,
    });
    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: url,
        'Cache-Control': `private, max-age=${REDIRECT_CACHE_SECONDS}`,
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (error) {
    console.error('[notes] image serve failed:', error);
    return NextResponse.json({ error: 'failed' }, { status: 500, headers: { 'Cache-Control': 'private, no-store' } });
  }
}

/** Removes one image of the caller's note: the R2 file first, then the row. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const found = await findOwnImage((await params).imageId);
    if (found.status !== 200) return NextResponse.json({ error: 'not_found' }, { status: found.status });

    await deleteFromR2(found.image.file_key);
    const { error } = await found.session.supabase.from('lesson_note_images').delete().eq('id', found.image.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[notes] image delete failed:', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
