import { NextRequest, NextResponse } from 'next/server';
import { generateLessonMetadata } from '@/lib/hebrew-date';

/**
 * GET /api/lesson-metadata?date=YYYY-MM-DD
 * Returns auto-generated lesson metadata (Hebrew date, parsha, title, etc.)
 */
export async function GET(request: NextRequest) {
  const dateStr = request.nextUrl.searchParams.get('date');

  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json(
      { error: 'Missing or invalid date parameter (YYYY-MM-DD)' },
      { status: 400 }
    );
  }

  try {
    const metadata = generateLessonMetadata(dateStr);
    return NextResponse.json(metadata);
  } catch (error) {
    console.error('Metadata generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate metadata' },
      { status: 500 }
    );
  }
}
