import { NextRequest, NextResponse } from 'next/server';
import { getSignedInClient } from '@/lib/account/server';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { listenPayloadSchema } from '@/lib/validators';

/*
 * Listen statistics from the audio controller (src/lib/listen-tracker.ts),
 * sent with navigator.sendBeacon: the first event after 30 seconds of real
 * playback, then throttled heartbeats with the same session id, which
 * record_listen_event() turns into updates of that session's row. Anonymous
 * listeners are counted by their random device id; the user id comes from the
 * session cookie only.
 */

// A heartbeat per minute per playing device, plus pause/hide flushes; leaves
// room for a household of listeners behind one IP.
const requestsPerIp = createRateLimiter({ limit: 120, windowMs: 10 * 60 * 1000 });

export async function POST(request: NextRequest) {
  if (!requestsPerIp.consume(getClientIp(request.headers))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  if (Number(request.headers.get('content-length') ?? 0) > 2_000) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 });
  }
  let body: unknown;
  try {
    // sendBeacon posts a Blob, so read text instead of trusting the content type.
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = listenPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_listen' }, { status: 400 });
  }

  const session = await getSignedInClient().catch(() => null);
  const { sessionId, lessonId, audioFileId, listenedSeconds, deviceId, source } = parsed.data;
  const { data: recorded, error } = await createAdminSupabaseClient().rpc('record_listen_event', {
    p_session_id: sessionId,
    p_lesson_id: lessonId,
    p_audio_file_id: audioFileId ?? null,
    p_user_id: session?.userId ?? null,
    p_device_id: deviceId,
    p_listened_seconds: listenedSeconds,
    p_source: source,
  });

  if (error) {
    console.error('[listen] record failed:', error.message);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
  // Unknown or unpublished lesson, or a session id owned by another device.
  if (recorded !== true) {
    return NextResponse.json({ error: 'not_recorded' }, { status: 422 });
  }
  return new NextResponse(null, { status: 204 });
}
