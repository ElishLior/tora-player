import { NextRequest, NextResponse } from 'next/server';
import { attachmentDisposition } from '@/lib/attachment-disposition';
import { isAdmin } from '@/lib/auth/admin';
import { buildImageDownloadNames, sortLessonImages } from '@/lib/image-download';
import { servableImageContentType, servableImageExtension } from '@/lib/image-keys';
import { isUuid } from '@/lib/lesson-slugs';
import { getDownloadPresignedUrl } from '@/lib/r2';
import { lessonReadClient } from '@/lib/supabase/admin-lesson';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The browser follows the redirect at once; a transfer that started in time is not cut off.
const PRESIGNED_URL_TTL_SECONDS = 300;

interface LessonLookup {
  id: string;
  title: string | null;
  slug?: string | null;
  is_published: boolean;
}

interface ImageLookup {
  id: string;
  lesson_id: string;
  file_key: string;
  sort_order: number;
  lesson: LessonLookup | LessonLookup[] | null;
}

interface ImageDownloadPlan {
  fileKey: string;
  contentType: string;
  filename: string;
  asciiFilename: string;
}

/**
 * Everything the download needs, or null when the image must not be served:
 * unknown id, unpublished lesson for a non-admin, or a key the image route
 * refuses. Reads go through lessonReadClient (RLS for everyone else); the
 * publication check repeats here so the rule holds even without RLS.
 * Errors throw (500).
 */
async function planImageDownload(imageId: string): Promise<ImageDownloadPlan | null> {
  // Gate on the id shape first: a junk id is a 404, never a database error.
  if (!isUuid(imageId)) return null;

  const supabase = await lessonReadClient();
  const { data, error } = await supabase
    .from('lesson_images')
    .select('id, lesson_id, file_key, sort_order, lesson:lessons(*)')
    .eq('id', imageId)
    .maybeSingle();
  if (error) throw error;
  const image = data as ImageLookup | null;
  if (!image) return null;

  const lesson = Array.isArray(image.lesson) ? image.lesson[0] : image.lesson;
  if (!lesson) return null;
  if (!lesson.is_published && !(await isAdmin())) return null;

  const extension = servableImageExtension(image.file_key);
  const contentType = servableImageContentType(image.file_key);
  if (!extension || !contentType) return null;

  // Position in the gallery (the lightbox counter), not in the upload order.
  const siblings = await supabase.from('lesson_images').select('id, sort_order').eq('lesson_id', image.lesson_id);
  if (siblings.error) throw siblings.error;
  const ordered = sortLessonImages((siblings.data ?? []) as { id: string; sort_order: number }[]);
  const index = ordered.findIndex((row) => row.id === image.id);
  if (index < 0) return null;

  const names = buildImageDownloadNames({
    title: lesson.title,
    slug: lesson.slug,
    position: index + 1,
    extension,
  });
  return {
    // The original, never the thumbnail: the download is the full-size file.
    fileKey: image.file_key,
    contentType,
    filename: names.filename,
    asciiFilename: names.asciiFilename,
  };
}

async function redirectToImage(imageId: string, isGet: boolean): Promise<Response> {
  // Error bodies are JSON for GET only; HEAD carries no body.
  const notFound = () =>
    isGet ? NextResponse.json({ error: 'Not found' }, { status: 404 }) : new Response(null, { status: 404 });

  try {
    const plan = await planImageDownload(imageId);
    if (!plan) return notFound();

    const signedUrl = await getDownloadPresignedUrl(plan.fileKey, {
      expiresIn: PRESIGNED_URL_TTL_SECONDS,
      contentType: plan.contentType,
      contentDisposition: attachmentDisposition(plan.filename, plan.asciiFilename),
    });

    return new Response(null, {
      status: 302,
      headers: {
        Location: signedUrl,
        // The URL is tied to the caller's access (draft or published), so never shared caches.
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (error) {
    console.error('Image download error:', error);
    return isGet
      ? NextResponse.json({ error: 'Failed to prepare download' }, { status: 500 })
      : new Response(null, { status: 500 });
  }
}

/**
 * Lesson image download by `lesson_images.id` (never a raw key or URL): 302 to
 * a short-lived presigned R2 URL whose Content-Disposition is an attachment
 * named `<lesson>-<n>.<ext>`. Image bytes never pass through Vercel.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ imageId: string }> }) {
  const { imageId } = await params;
  return redirectToImage(imageId, true);
}

/** Same redirect as GET, without a body. The image's metadata is not probed separately. */
export async function HEAD(_request: NextRequest, { params }: { params: Promise<{ imageId: string }> }) {
  const { imageId } = await params;
  return redirectToImage(imageId, false);
}
