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
    const clipStart = searchParams.get('start');
    const clipEnd = searchParams.get('end');

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

    // Build the lesson URL with optional clip params
    const urlParams = new URLSearchParams();
    if (timestamp) urlParams.set('t', timestamp);
    if (clipStart) urlParams.set('start', clipStart);
    if (clipEnd) urlParams.set('end', clipEnd);
    const queryString = urlParams.toString();
    const lessonUrl = `${appUrl}/he/lessons/${encodeURIComponent(lessonId)}${queryString ? `?${queryString}` : ''}`;

    // Escape all user-controlled content for HTML output
    const title = escapeHtml(lesson.hebrew_title || lesson.title || '');
    const escapedUrl = escapeHtml(lessonUrl);

    // Build description: include clip time range if provided
    let descriptionText = lesson.description || '';
    if (clipStart && clipEnd) {
      const startSec = parseFloat(clipStart);
      const endSec = parseFloat(clipEnd);
      if (!isNaN(startSec) && !isNaN(endSec)) {
        const formatSec = (s: number) => {
          const m = Math.floor(s / 60);
          const sec = Math.floor(s % 60);
          return `${m}:${sec.toString().padStart(2, '0')}`;
        };
        const clipRange = `\u2702 קטע: ${formatSec(startSec)} - ${formatSec(endSec)}`;
        descriptionText = descriptionText
          ? `${clipRange} | ${descriptionText}`
          : clipRange;
      }
    }
    const description = escapeHtml(descriptionText);

    // Use clip duration if available, otherwise lesson duration
    let durationMeta = '';
    if (clipStart && clipEnd) {
      const clipDuration = Math.max(0, parseFloat(clipEnd) - parseFloat(clipStart));
      if (!isNaN(clipDuration) && clipDuration > 0) {
        durationMeta = `<meta property="music:duration" content="${escapeHtml(String(Math.round(clipDuration)))}" />`;
      }
    } else if (lesson.duration) {
      durationMeta = `<meta property="music:duration" content="${escapeHtml(String(lesson.duration))}" />`;
    }

    return new NextResponse(
      `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8" />
  <title>${title}${clipStart && clipEnd ? ' - קטע' : ''} - נגן תורה</title>
  <meta property="og:title" content="${title}${clipStart && clipEnd ? ' - קטע' : ''}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:type" content="music.song" />
  <meta property="og:url" content="${escapedUrl}" />
  <meta property="og:site_name" content="נגן תורה" />
  ${durationMeta}
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${title}${clipStart && clipEnd ? ' - קטע' : ''}" />
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
