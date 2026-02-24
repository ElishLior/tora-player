import { NextResponse } from 'next/server';
import { configureBucketCors } from '@/lib/r2';

export const runtime = 'nodejs';

/**
 * One-time endpoint to configure CORS on the R2 bucket.
 * Call once after deployment: POST /api/r2/setup-cors
 */
export async function POST() {
  try {
    await configureBucketCors(['*']);
    return NextResponse.json({ success: true, message: 'CORS configured on R2 bucket' });
  } catch (error) {
    console.error('Failed to configure CORS:', error);
    return NextResponse.json(
      { error: 'Failed to configure CORS', details: String(error) },
      { status: 500 }
    );
  }
}
