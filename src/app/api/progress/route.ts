import { NextRequest, NextResponse } from 'next/server';
import { requireServerSupabaseClient } from '@/lib/supabase/server';
import { playbackProgressSchema } from '@/lib/validators';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    const parsed = playbackProgressSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const supabase = await requireServerSupabaseClient();
    const { data, error } = await supabase
      .from('playback_progress')
      .upsert(
        {
          lesson_id: parsed.data.lesson_id,
          position: parsed.data.position,
          completed: parsed.data.completed,
          last_played_at: new Date().toISOString(),
        },
        { onConflict: 'lesson_id' }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Progress update error:', error);
    return NextResponse.json(
      { error: 'Failed to update progress' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lessonId = searchParams.get('lessonId');

    if (!lessonId) {
      return NextResponse.json(
        { error: 'Missing lessonId parameter' },
        { status: 400 }
      );
    }

    const supabase = await requireServerSupabaseClient();
    const { data } = await supabase
      .from('playback_progress')
      .select('*')
      .eq('lesson_id', lessonId)
      .single();

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Progress fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch progress' },
      { status: 500 }
    );
  }
}
