import { NextResponse } from 'next/server';

/**
 * Debug endpoint: verify ADMIN_PASSWORD env var is loaded.
 * Does NOT expose the actual password value.
 * Remove this endpoint after debugging is complete.
 */
export async function GET() {
  const pw = process.env.ADMIN_PASSWORD;
  return NextResponse.json({
    hasPassword: !!pw,
    length: pw?.length ?? 0,
    isDefault: pw === 'admin123' || !pw,
    nodeEnv: process.env.NODE_ENV,
  });
}
