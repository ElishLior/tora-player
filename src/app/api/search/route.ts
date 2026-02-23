import { NextRequest, NextResponse } from 'next/server';
import { requireServerSupabaseClient } from '@/lib/supabase/server';
import { searchSchema } from '@/lib/validators';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const raw = {
      query: searchParams.get('query') || '',
      series_id: searchParams.get('series_id') || undefined,
      date_from: searchParams.get('date_from') || undefined,
      date_to: searchParams.get('date_to') || undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 20,
      offset: searchParams.get('offset') ? Number(searchParams.get('offset')) : 0,
    };

    const parsed = searchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { query, series_id, date_from, date_to, limit, offset } = parsed.data;

    const supabase = await requireServerSupabaseClient();
    const escaped = query.replace(/[%_\\]/g, '\\$&');
    let queryBuilder = supabase
      .from('lessons')
      .select('*, series(name, hebrew_name)', { count: 'exact' })
      .eq('is_published', true)
      .or(`title.ilike.%${escaped}%,hebrew_title.ilike.%${escaped}%,description.ilike.%${escaped}%`);

    if (series_id) {
      queryBuilder = queryBuilder.eq('series_id', series_id);
    }
    if (date_from) {
      queryBuilder = queryBuilder.gte('date', date_from);
    }
    if (date_to) {
      queryBuilder = queryBuilder.lte('date', date_to);
    }

    const { data, error, count } = await queryBuilder
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data,
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}
