import { NextRequest, NextResponse } from 'next/server';
import { attachmentDisposition } from '@/lib/attachment-disposition';
import { isAdmin } from '@/lib/auth/admin';
import { isUuid } from '@/lib/lesson-slugs';
import { isLessonSourceKey, isMissingLessonSources, lessonSourceDownloadName } from '@/lib/lesson-sources';
import { getDownloadPresignedUrl } from '@/lib/r2';
import { lessonReadClient } from '@/lib/supabase/admin-lesson';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRESIGNED_URL_TTL_SECONDS = 300;

interface SourceLookup {
  status: string;
  file_key: string | null;
  file_name: string | null;
  lesson: { title: string | null; hebrew_title: string | null; date: string | null; is_published: boolean } | null;
}

/**
 * A lesson's sources PDF by lesson id (never a key): 302 to a short-lived
 * presigned R2 URL, inline (opens in the browser's PDF viewer) or, with
 * `?download=1`, as an attachment named after the lesson. Drafts are admin-only:
 * reads go through lessonReadClient (RLS for everyone else) and the publication
 * check repeats here. PDF bytes never pass through Vercel.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!isUuid(lessonId)) return notFound();

  try {
    const supabase = await lessonReadClient();
    const { data, error } = await supabase
      .from('lesson_sources')
      .select('status, file_key, file_name, lesson:lessons!inner(title, hebrew_title, date, is_published)')
      .eq('lesson_id', lessonId)
      .maybeSingle();
    // Before migration 029 there are no sources: a 404, not an error.
    if (error) {
      if (isMissingLessonSources(error)) return notFound();
      throw error;
    }
    const source = data as unknown as SourceLookup | null;
    const lesson = Array.isArray(source?.lesson) ? source?.lesson[0] : source?.lesson;
    if (!source || !lesson || source.status !== 'ready' || !source.file_key || !isLessonSourceKey(source.file_key)) {
      return notFound();
    }
    if (!lesson.is_published && !(await isAdmin())) return notFound();

    const download = request.nextUrl.searchParams.get('download') === '1';
    const filename = lessonSourceDownloadName(lesson, source.file_name);
    const signedUrl = await getDownloadPresignedUrl(source.file_key, {
      expiresIn: PRESIGNED_URL_TTL_SECONDS,
      contentType: 'application/pdf',
      contentDisposition: attachmentDisposition(filename, 'lesson-sources.pdf', download ? 'attachment' : 'inline'),
    });

    return new Response(null, {
      status: 302,
      headers: { Location: signedUrl, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    });
  } catch (error) {
    console.error('Sources PDF error:', error);
    return NextResponse.json({ error: 'Failed to prepare the document' }, { status: 500 });
  }
}
