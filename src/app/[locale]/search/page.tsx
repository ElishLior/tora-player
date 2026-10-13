import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { normalizeSearchQuery } from '@/lib/supabase/lesson-list';
import { createCatalogLessonListReader } from '@/lib/supabase/anon';
import { matchTags, tagPath, type TagCount } from '@/lib/tag-links';
import { Link } from '@/i18n/routing';
import { LessonCard } from '@/components/lessons/lesson-card';
import { LessonCardList } from '@/components/lessons/lesson-card-list';
import { EmptyState } from '@/components/shared/empty-state';
import { ListLoadError } from '@/components/shared/list-load-error';
import { PageHeader } from '@/components/shared/page-header';
import { SearchField } from '@/components/shared/search-field';
import { Search } from 'lucide-react';
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
  const t = await getTranslations('pagesDesign');

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
      <PageHeader title={t('search.title')} />

      <form role="search">
        <SearchField
          name="q"
          defaultValue={q}
          placeholder={t('search.placeholder')}
          aria-label={t('search.placeholder')}
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
                  className="inline-flex items-baseline gap-1.5 rounded-full bg-primary/10 px-3.5 py-1.5 text-[13px] font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <bdi>#{tag}</bdi>
                  <span className="text-xs font-normal tabular-nums text-muted-foreground">{lesson_count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {q ? (
        failed ? (
          <ListLoadError />
        ) : results.length > 0 ? (
          <LessonCardList>
            {results.map((lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} />
            ))}
          </LessonCardList>
        ) : (
          <EmptyState
            icon={Search}
            title={t('search.noResults')}
            description={t('search.noResultsFor', { query: q })}
          />
        )
      ) : (
        <EmptyState icon={Search} title={t('search.hint')} />
      )}
    </div>
  );
}
