import { NextRequest, NextResponse } from 'next/server';
import { uploadToR2 } from '@/lib/r2';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Receive a file chunk and store it in R2 as a temporary object.
 * Chunks are assembled by /api/upload/complete.
 *
 * Storing in R2 (not /tmp) ensures chunks persist across
 * different Vercel serverless function instances.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const uploadId = formData.get('uploadId') as string;
    const partNumber = Number(formData.get('partNumber') || 0);
    const chunk = formData.get('chunk') as File | null;

    if (!uploadId || !chunk) {
      return NextResponse.json(
        { error: 'Missing required fields: uploadId, chunk' },
        { status: 400 }
      );
    }

    // Store chunk in R2 under a temp prefix
    const chunkBuffer = Buffer.from(await chunk.arrayBuffer());
    const chunkKey = `_chunks/${uploadId}/part_${String(partNumber).padStart(4, '0')}`;
    await uploadToR2(chunkKey, chunkBuffer, 'application/octet-stream');

    return NextResponse.json({
      success: true,
      partNumber,
      size: chunkBuffer.length,
    });
  } catch (error) {
    console.error('Chunk upload error:', error);
    return NextResponse.json(
      { error: 'Failed to store chunk' },
      { status: 500 }
    );
  }
}
