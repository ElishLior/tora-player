export const dynamic = 'force-dynamic';

import { cache } from 'react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { getCachedCategoriesTree, getCachedCategoryLessonCounts, getCachedCategoryLessons } from '@/lib/supabase/anon';
import { PlayCategoryButton } from '@/components/lessons/play-category-button';
import { LessonCard } from '@/components/lessons/lesson-card';
import { LessonCardList } from '@/components/lessons/lesson-card-list';
import { EmptyState } from '@/components/shared/empty-state';
import { ListLoadError } from '@/components/shared/list-load-error';
import { CollectionHeader } from '@/components/shared/collection-header';
import { CoverTile } from '@/components/lessons/reading-cover';
import { CategoryTiles } from '@/components/categories/category-tiles';
import { Link } from '@/i18n/routing';
import { BookOpen, ChevronLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/json-ld';
import { DEFAULT_LOCALE, SITE_NAME, SITE_TAGLINE, categoryPath } from '@/config/site';
import { breadcrumbJsonLd, pageAlternates, truncateText } from '@/lib/seo';
import { categoryAncestors, categoryLabel, childrenOf, descendantIds, findCategory } from '@/lib/category-tree';
import { readingHue } from '@/lib/lesson-display';
import type { CategoryWithChildren } from '@/types/database';

type Props = {
  params: Promise<{ locale: string; categoryId: string }>;
};

/**
 * One category tree read per request, shared by generateMetadata and the page. `failed` tells a
 * read that broke (error block) from a tree that loaded without this category (404).
 */
const loadTree = cache(async (): Promise<{ tree: CategoryWithChildren[] | null; failed: boolean }> => {
  try {
    return { tree: await getCachedCategoriesTree(), failed: false };
  } catch {
    return { tree: null, failed: true };
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categoryId } = await params;
  const { tree } = await loadTree();
  const category = tree ? findCategory(tree, categoryId) : undefined;
  if (!category) return {};
  const name = categoryLabel(category, 'he');
  return {
    title: name,
    description: truncateText(category.description || `${name} — ${SITE_TAGLINE.he}`),
    alternates: pageAlternates(categoryPath(category.id)),
  };
}

export default async function CategoryDetailPage({ params }: Props) {
  const { locale, categoryId } = await params;
  setRequestLocale(locale);

  if (!isSupabaseConfigured()) return notFound();

  const { tree, failed } = await loadTree();
  if (failed) {
    return (
      <div className="animate-fade-in">
        <ListLoadError />
      </div>
    );
  }
  if (!tree) return notFound();
  const category = findCategory(tree, categoryId);
  if (!category) return notFound();

  // Breadcrumb: top level first, then each ancestor. Subcategories are listed below.
  const ancestors = categoryAncestors(tree, categoryId);
  const subcategories = childrenOf(tree, categoryId);
  const name = categoryLabel(category, locale);

  // Lessons of this category and of all its subcategories (see getLessonsByCategory).
  let lessons: Awaited<ReturnType<typeof getCachedCategoryLessons>> = [];
  let lessonsFailed = false;
  try {
    lessons = await getCachedCategoryLessons(categoryId);
  } catch {
    lessonsFailed = true;
  }

  // Counts for the subcategory tiles (cached). A failed count read shows no numbers, not an error.
  const counts =
    subcategories.length > 0 ? await getCachedCategoryLessonCounts().catch(() => ({}) as Record<string, number>) : {};

  // The continuous-play session starts from the first lessons of the list above (no second read),
  // so the tap can play synchronously. Snapshot is taken after the cached read: its rows predate it.
  const scopeIds = descendantIds(tree, categoryId);
  const snapshotAt = new Date().toISOString();

  const tCategories = await getTranslations({ locale: DEFAULT_LOCALE, namespace: 'categories' });
  const t = await getTranslations('categories');
  const tDesign = await getTranslations('pagesDesign');

  return (
    <div className="animate-fade-in space-y-6">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: SITE_NAME.he, pathname: '/' },
          { name: tCategories('title'), pathname: '/categories' },
          ...ancestors.map((ancestor) => ({
            name: categoryLabel(ancestor, DEFAULT_LOCALE),
            pathname: categoryPath(ancestor.id),
          })),
          { name: categoryLabel(category, DEFAULT_LOCALE), pathname: categoryPath(category.id) },
        ])}
      />

      <CollectionHeader
        hue={readingHue(category.id)}
        eyebrow={tDesign('eyebrow.category')}
        title={name}
        description={category.description}
        cover={
          <CoverTile
            text={name}
            hue={readingHue(category.id)}
            className="h-28 w-28 sm:h-36 sm:w-36"
            textClassName="line-clamp-3 text-lg"
          />
        }
        back={
          /* Breadcrumb */
          <nav className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
            <Link
              href="/categories"
              className="rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {t('title')}
            </Link>
            {ancestors.map((ancestor) => (
              <span key={ancestor.id} className="flex items-center gap-1.5">
                <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5 ltr:rotate-180" />
                <Link
                  href={`/categories/${ancestor.id}`}
                  className="rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  {categoryLabel(ancestor, locale)}
                </Link>
              </span>
            ))}
            <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5 ltr:rotate-180" />
            <span className="font-medium text-foreground" aria-current="page">
              {name}
            </span>
          </nav>
        }
        actions={
          <PlayCategoryButton categoryId={category.id} scopeIds={scopeIds} snapshotAt={snapshotAt} rows={lessons} />
        }
      />

      {/* Subcategories as tiles, with their counts, and theirs inside each tile */}
      {subcategories.length > 0 && (
        <section aria-labelledby="subcategories-title" className="space-y-3">
          <h2 id="subcategories-title" className="text-lg font-bold">
            {tDesign('subcategories')}
          </h2>
          <CategoryTiles
            nodes={subcategories}
            tree={tree}
            counts={counts}
            locale={locale}
            emptyLabel={t('emptyCategory')}
            leading="folder"
          />
        </section>
      )}

      {/* Lessons */}
      {lessonsFailed ? (
        <ListLoadError />
      ) : lessons.length > 0 ? (
        <LessonCardList>
          {lessons.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson} />
          ))}
        </LessonCardList>
      ) : subcategories.length === 0 ? (
        <EmptyState icon={BookOpen} title={t('noLessonsInCategory')} />
      ) : null}
    </div>
  );
}
