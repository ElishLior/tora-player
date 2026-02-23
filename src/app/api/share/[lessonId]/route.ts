import { NextRequest, NextResponse } from 'next/server';
import { requireServerSupabaseClient } from '@/lib/supabase/server';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  try {
    const { lessonId } = await params;
    const { searchParams } = new URL(request.url);
    const timestamp = searchParams.get('t');

    const supabase = await requireServerSupabaseClient();
    const { data: lesson, error } = await supabase
      .from('lessons')
      .select('*, series(name, hebrew_name)')
      .eq('id', lessonId)
      .single();

    if (error || !lesson) {
      return NextResponse.json(
        { error: 'Lesson not found' },
        { status: 404 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const safeTimestamp = timestamp ? encodeURIComponent(timestamp) : '';
    const lessonUrl = `${appUrl}/he/lessons/${encodeURIComponent(lessonId)}${safeTimestamp ? `?t=${safeTimestamp}` : ''}`;

    // Escape all user-controlled content for HTML output
    const title = escapeHtml(lesson.hebrew_title || lesson.title || '');
    const description = escapeHtml(lesson.description || '');
    const escapedUrl = escapeHtml(lessonUrl);

    return new NextResponse(
      `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8" />
  <title>${title} - נגן תורה</title>
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:type" content="music.song" />
  <meta property="og:url" content="${escapedUrl}" />
  <meta property="og:site_name" content="נגן תורה" />
  ${lesson.duration ? `<meta property="music:duration" content="${escapeHtml(String(lesson.duration))}" />` : ''}
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta http-equiv="refresh" content="0;url=${escapedUrl}" />
</head>
<body>
  <p>Redirecting to <a href="${escapedUrl}">${title}</a>...</p>
</body>
</html>`,
      {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      }
    );
  } catch (error) {
    console.error('Share error:', error);
    return NextResponse.json(
      { error: 'Failed to generate share page' },
      { status: 500 }
    );
  }
}
