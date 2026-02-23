import { setRequestLocale } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { LessonCard } from '@/components/lessons/lesson-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Search } from 'lucide-react';
import type { LessonWithRelations } from '@/types/database';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
};

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { q } = await searchParams;
  setRequestLocale(locale);

  let results: LessonWithRelations[] = [];

  if (q && q.length > 0) {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      try {
        const { data } = await supabase
          .from('lessons')
          .select('*, series(name, hebrew_name)')
          .eq('is_published', true)
          .or(`title.ilike.%${q}%,hebrew_title.ilike.%${q}%,description.ilike.%${q}%`)
          .order('date', { ascending: false })
          .limit(50);
        results = (data || []) as LessonWithRelations[];
      } catch {
        results = [];
      }
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        {locale === 'he' ? 'חיפוש' : 'Search'}
      </h1>

      <form className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          name="q"
          defaultValue={q}
          placeholder={locale === 'he' ? 'חיפוש שיעורים...' : 'Search lessons...'}
          className="w-full rounded-xl border bg-background ps-10 pe-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          autoFocus
        />
      </form>

      {q ? (
        results.length > 0 ? (
          <div className="space-y-3">
            {results.map((lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Search}
            title={locale === 'he' ? 'לא נמצאו תוצאות' : 'No results found'}
            description={locale === 'he' ? `לא נמצאו שיעורים עבור "${q}"` : `No lessons found for "${q}"`}
          />
        )
      ) : (
        <p className="text-center text-muted-foreground py-12">
          {locale === 'he' ? 'הקלד לחיפוש שיעורים' : 'Type to search lessons'}
        </p>
      )}
    </div>
  );
}
