import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdmin } from '@/lib/auth/admin';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

const importUrlSchema = z.object({
  lessonId: z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/),
  url: z.url({ protocol: /^https?$/ }).max(2000),
});

/** Admin only: points a lesson's audio at an external http(s) URL. */
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = importUrlSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Expected { lessonId: uuid, url: http(s) URL }' }, { status: 400 });
  }
  const { lessonId, url } = parsed.data;

  const { error } = await createAdminSupabaseClient()
    .from('lessons')
    .update({
      audio_url: url,
      audio_url_fallback: url,
      source_type: 'url_import',
    })
    .eq('id', lessonId);

  if (error) {
    console.error('Import URL error:', error.message);
    return NextResponse.json({ error: 'Failed to import URL' }, { status: 500 });
  }

  return NextResponse.json({ success: true, lessonId, audioUrl: url });
}
