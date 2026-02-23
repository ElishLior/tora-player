import { NextRequest, NextResponse } from 'next/server';
import { requireServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lessonId, url } = body;

    if (!lessonId || !url) {
      return NextResponse.json(
        { error: 'Missing required fields: lessonId, url' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Update lesson with the external URL
    const supabase = await requireServerSupabaseClient();
    const { error } = await supabase
      .from('lessons')
      .update({
        audio_url: url,
        audio_url_fallback: url,
        source_type: 'url_import',
      })
      .eq('id', lessonId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      lessonId,
      audioUrl: url,
    });
  } catch (error) {
    console.error('Import URL error:', error);
    return NextResponse.json(
      { error: 'Failed to import URL' },
      { status: 500 }
    );
  }
}
