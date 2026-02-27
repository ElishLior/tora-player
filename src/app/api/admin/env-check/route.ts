import { NextResponse } from 'next/server';
import { createHash } from 'crypto';

/**
 * Debug endpoint: verify ADMIN_PASSWORD env var is loaded.
 * Remove this endpoint after debugging is complete.
 */
export async function GET(request: Request) {
  const pw = process.env.ADMIN_PASSWORD;
  const url = new URL(request.url);
  const testPw = url.searchParams.get('test');

  const result: Record<string, unknown> = {
    hasPassword: !!pw,
    length: pw?.length ?? 0,
    isDefault: pw === 'admin123' || !pw,
    nodeEnv: process.env.NODE_ENV,
    firstChar: pw ? pw[0] : null,
    lastChar: pw ? pw[pw.length - 1] : null,
    storedHash: pw ? createHash('sha256').update(pw).digest('hex').slice(0, 12) + '...' : null,
  };

  if (testPw) {
    result.testLength = testPw.length;
    result.testHash = createHash('sha256').update(testPw).digest('hex').slice(0, 12) + '...';
    result.match = testPw === pw;
    result.trimmedMatch = testPw.trim() === pw?.trim();
  }

  return NextResponse.json(result);
}
