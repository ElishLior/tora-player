import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth/admin';
import { configureBucketCors } from '@/lib/r2';

export const runtime = 'nodejs';

/**
 * Admin only, one-time: configure CORS on the R2 bucket.
 * Call once after deployment: POST /api/r2/setup-cors
 */
export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await configureBucketCors(['*']);
    return NextResponse.json({ success: true, message: 'CORS configured on R2 bucket' });
  } catch (error) {
    console.error('Failed to configure CORS:', error);
    return NextResponse.json({ error: 'Failed to configure CORS' }, { status: 500 });
  }
}
