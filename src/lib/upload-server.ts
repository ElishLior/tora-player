import 'server-only';
import { NextResponse } from 'next/server';
import { AdminRequiredError, requireAdmin } from '@/lib/auth/admin';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 401 response for non-admin callers of the upload routes, otherwise null. */
export async function rejectNonAdmin(): Promise<NextResponse | null> {
  try {
    await requireAdmin();
    return null;
  } catch (error) {
    if (error instanceof AdminRequiredError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: error.status });
    }
    throw error;
  }
}

/** Upload routes only write to R2 for lessons that already exist. */
export async function lessonExists(lessonId: string): Promise<boolean> {
  const { data, error } = await createAdminSupabaseClient()
    .from('lessons')
    .select('id')
    .eq('id', lessonId)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

const AUDIO_FORMATS: Record<string, { codec: string; contentType: string }> = {
  mp3: { codec: 'mp3', contentType: 'audio/mpeg' },
  m4a: { codec: 'aac', contentType: 'audio/mp4' },
  aac: { codec: 'aac', contentType: 'audio/aac' },
  ogg: { codec: 'opus', contentType: 'audio/ogg' },
  oga: { codec: 'opus', contentType: 'audio/ogg' },
  opus: { codec: 'opus', contentType: 'audio/ogg' },
  webm: { codec: 'opus', contentType: 'audio/webm' },
  wav: { codec: 'wav', contentType: 'audio/wav' },
  flac: { codec: 'flac', contentType: 'audio/flac' },
};

/** Storage extension, codec and content type for an audio filename; null if unsupported. */
export function audioFormatFor(fileName: string): { ext: string; codec: string; contentType: string } | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const format = AUDIO_FORMATS[ext];
  return format ? { ext, ...format } : null;
}
