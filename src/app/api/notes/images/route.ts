import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSignedInClient } from '@/lib/account/server';
import { noteImageKey, validateNoteImage, type NoteImageError } from '@/lib/note-rules';
import { deleteFromR2, uploadToR2 } from '@/lib/r2';
import { createRateLimiter } from '@/lib/rate-limit';
import { UUID_RE } from '@/lib/upload-server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const STATUS_BY_ERROR: Record<NoteImageError, number> = {
  empty: 400,
  too_large: 413,
  unsupported: 415,
  too_many: 409,
};

// Bounds storage growth per account (per server instance; see rate-limit.ts).
const uploadLimiter = createRateLimiter({ limit: 60, windowMs: 60 * 60 * 1000 });

function parseDimension(value: FormDataEntryValue | null): number | null {
  const number = Number(value);
  return typeof value === 'string' && Number.isInteger(number) && number > 0 && number <= 20000 ? number : null;
}

/**
 * Attaches one image to a personal note of the signed-in user (multipart:
 * file, noteId, optional width/height of the downscaled image). The format
 * comes from the file's magic bytes. The file is stored under the owner's
 * private R2 prefix and is served only by /api/notes/images/[imageId].
 */
export async function POST(request: NextRequest) {
  const session = await getSignedInClient();
  if (!session) return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  const { supabase, userId } = session;

  if (!uploadLimiter.consume(userId)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  let fileKey: string | null = null;
  try {
    const form = await request.formData();
    const file = form.get('file');
    const noteId = form.get('noteId');
    if (!(file instanceof File) || typeof noteId !== 'string' || !UUID_RE.test(noteId)) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }

    // RLS: only the owner sees the note and its images.
    const { data: note, error: noteError } = await supabase
      .from('lesson_notes')
      .select('id')
      .eq('id', noteId)
      .maybeSingle();
    if (noteError) throw noteError;
    if (!note) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const { count, error: countError } = await supabase
      .from('lesson_note_images')
      .select('id', { count: 'exact', head: true })
      .eq('note_id', noteId);
    if (countError) throw countError;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = validateNoteImage({ bytes, size: bytes.length, existingCount: count ?? 0 });
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: STATUS_BY_ERROR[check.error] });

    const imageId = randomUUID();
    fileKey = noteImageKey(userId, noteId, imageId, check.type.ext);
    await uploadToR2(fileKey, bytes, check.type.mime);

    const { data: image, error: insertError } = await supabase
      .from('lesson_note_images')
      .insert({
        id: imageId,
        note_id: noteId,
        user_id: userId,
        file_key: fileKey,
        content_type: check.type.mime,
        file_size: bytes.length,
        width: parseDimension(form.get('width')),
        height: parseDimension(form.get('height')),
      })
      .select('id, width, height')
      .single();
    if (insertError) {
      await deleteFromR2(fileKey).catch(() => undefined);
      fileKey = null;
      // Raised by the per-note limit trigger when parallel uploads race.
      if (insertError.message.includes('note_image_limit')) {
        return NextResponse.json({ error: 'too_many' }, { status: 409 });
      }
      throw insertError;
    }

    return NextResponse.json({ image });
  } catch (error) {
    console.error('[notes] image upload failed:', error);
    if (fileKey) await deleteFromR2(fileKey).catch(() => undefined);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
