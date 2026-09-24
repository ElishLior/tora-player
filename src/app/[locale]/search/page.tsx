import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { normalizeSearchQuery } from '@/lib/supabase/lesson-list';
import { createCatalogLessonListReader } from '@/lib/supabase/anon';
import { matchTags, tagPath, type TagCount } from '@/lib/tag-links';
import { Link } from '@/i18n/routing';
import { LessonCard } from '@/components/lessons/lesson-card';
import { EmptyState } from '@/components/shared/empty-state';
import { AlertTriangle, Search } from 'lucide-react';
import type { LessonWithRelations } from '@/types/database';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
};

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const q = normalizeSearchQuery((await searchParams).q);
  setRequestLocale(locale);
  const tagT = await getTranslations('tagBrowse');
  const lessonsT = await getTranslations('lessons');

  let results: LessonWithRelations[] = [];
  let tags: TagCount[] = [];
  let failed = false;

  if (q) {
    if (isSupabaseConfigured()) {
      try {
        const reader = createCatalogLessonListReader();
        const tagCounts = await reader.getTagCounts();
        const matched = matchTags(tagCounts, q);
        tags = tagCounts.filter((row) => matched.includes(row.tag));
        results = await reader.searchLessons(q, {}, matched);
      } catch (error) {
        console.error('Search failed:', error);
        failed = true;
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

      {tags.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-muted-foreground">{tagT('matchingTags')}</h2>
          <ul className="flex flex-wrap gap-2">
            {tags.map(({ tag, lesson_count }) => (
              <li key={tag}>
                <Link
                  href={tagPath(tag)}
                  className="inline-flex items-baseline gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20"
                >
                  <bdi>#{tag}</bdi>
                  <span className="text-xs font-normal text-muted-foreground tabular-nums">{lesson_count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {q ? (
        failed ? (
          <EmptyState icon={AlertTriangle} title={lessonsT('loadErrorTitle')} description={lessonsT('loadErrorDescription')} />
        ) : results.length > 0 ? (
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
