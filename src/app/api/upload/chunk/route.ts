import { NextRequest, NextResponse } from 'next/server';
import { uploadToR2 } from '@/lib/r2';
import { lessonExists, rejectNonAdmin, UUID_RE } from '@/lib/upload-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Client sends 3.5 MB chunks; allow some multipart overhead but nothing bigger. */
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_PARTS = 200;

/**
 * Receive one chunk of an admin audio upload and park it in R2 under
 * _chunks/{uploadId}/ (serverless instances don't share /tmp).
 * /api/upload/complete assembles the chunks.
 */
export async function POST(request: NextRequest) {
  const denied = await rejectNonAdmin();
  if (denied) return denied;

  try {
    const formData = await request.formData();
    const uploadId = formData.get('uploadId');
    const lessonId = formData.get('lessonId');
    const partNumber = Number(formData.get('partNumber'));
    const chunk = formData.get('chunk');

    if (
      typeof uploadId !== 'string' || !UUID_RE.test(uploadId) ||
      typeof lessonId !== 'string' || !UUID_RE.test(lessonId) ||
      !Number.isInteger(partNumber) || partNumber < 0 || partNumber >= MAX_PARTS ||
      !(chunk instanceof Blob)
    ) {
      return NextResponse.json({ error: 'Invalid chunk request' }, { status: 400 });
    }
    if (chunk.size === 0 || chunk.size > MAX_CHUNK_BYTES) {
      return NextResponse.json({ error: 'Chunk size out of range' }, { status: 413 });
    }
    if (!(await lessonExists(lessonId))) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    const chunkBuffer = Buffer.from(await chunk.arrayBuffer());
    const chunkKey = `_chunks/${uploadId}/part_${String(partNumber).padStart(4, '0')}`;
    await uploadToR2(chunkKey, chunkBuffer, 'application/octet-stream');

    return NextResponse.json({ success: true, partNumber, size: chunkBuffer.length });
  } catch (error) {
    console.error('Chunk upload error:', error);
    return NextResponse.json({ error: 'Failed to store chunk' }, { status: 500 });
  }
}
