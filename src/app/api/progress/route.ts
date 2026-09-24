import { NextRequest, NextResponse } from 'next/server';
import { getSignedInClient } from '@/lib/account/server';
import { playbackProgressSchema } from '@/lib/validators';

/**
 * Live playback progress for signed-in users (the player calls this while
 * listening). Anonymous listeners keep progress on the device only: 401, no write.
 */
export async function PUT(request: NextRequest) {
  const session = await getSignedInClient();
  if (!session) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = playbackProgressSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { error } = await session.supabase.from('playback_progress').upsert(
    {
      user_id: session.userId,
      lesson_id: parsed.data.lesson_id,
      position: Math.round(parsed.data.position),
      completed: parsed.data.completed,
      last_played_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,lesson_id' },
  );

  if (error) {
    console.error('[progress] upsert failed:', error.message);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
