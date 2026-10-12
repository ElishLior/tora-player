export const dynamic = 'force-dynamic';

import { cache } from 'react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { getCachedCategoriesTree, getCachedCategoryLessons } from '@/lib/supabase/anon';
import { PlayCategoryButton } from '@/components/lessons/play-category-button';
import { LessonCard } from '@/components/lessons/lesson-card';
import { LessonCardList } from '@/components/lessons/lesson-card-list';
import { EmptyState } from '@/components/shared/empty-state';
import { Link } from '@/i18n/routing';
import { BookOpen, ChevronLeft, FolderOpen } from 'lucide-react';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/json-ld';
import { DEFAULT_LOCALE, SITE_NAME, SITE_TAGLINE, categoryPath } from '@/config/site';
import { breadcrumbJsonLd, pageAlternates, truncateText } from '@/lib/seo';
import { categoryAncestors, categoryLabel, childrenOf, descendantIds, findCategory } from '@/lib/category-tree';
import type { CategoryWithChildren } from '@/types/database';

type Props = {
  params: Promise<{ locale: string; categoryId: string }>;
};

/** One category tree read per request, shared by generateMetadata and the page. Null when the read fails. */
const loadTree = cache(() => getCachedCategoriesTree().catch(() => null));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categoryId } = await params;
  const tree = await loadTree();
  const category = tree ? findCategory(tree, categoryId) : undefined;
  if (!category) return {};
  const name = categoryLabel(category, 'he');
  return {
    title: name,
    description: truncateText(category.description || `${name} — ${SITE_TAGLINE.he}`),
    alternates: pageAlternates(categoryPath(category.id)),
  };
}

/** Subcategories as links, each with its own subcategories nested below (up to three levels). */
function SubcategoryLinks({ nodes, locale }: { nodes: CategoryWithChildren[]; locale: string }) {
  return (
    <div className="space-y-1">
      {nodes.map((node) => (
        <div key={node.id} className="space-y-0.5">
          <Link
            href={`/categories/${node.id}`}
            className="flex items-center gap-3 rounded-lg bg-[hsl(var(--surface-elevated))] p-3 transition-colors hover:bg-[hsl(var(--surface-highlight))] focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-primary/10">
              <FolderOpen className="h-4 w-4 text-primary" />
            </div>
            <span className="flex-1 text-sm font-medium">{categoryLabel(node, locale)}</span>
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </Link>
          {node.children.length > 0 && (
            <div className="ms-6">
              <SubcategoryLinks nodes={node.children} locale={locale} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default async function CategoryDetailPage({ params }: Props) {
  const { locale, categoryId } = await params;
  setRequestLocale(locale);

  const isRTL = locale === 'he';

  if (!isSupabaseConfigured()) return notFound();

  const tree = await loadTree();
  if (!tree) return notFound();
  const category = findCategory(tree, categoryId);
  if (!category) return notFound();

  // Breadcrumb: top level first, then each ancestor. Subcategories are listed below.
  const ancestors = categoryAncestors(tree, categoryId);
  const subcategories = childrenOf(tree, categoryId);
  const name = categoryLabel(category, locale);

  // Lessons of this category and of all its subcategories (see getLessonsByCategory).
  const lessons = await getCachedCategoryLessons(categoryId);

  // The continuous-play session starts from the first lessons of the list above (no second read),
  // so the tap can play synchronously. Snapshot is taken after the cached read: its rows predate it.
  const scopeIds = descendantIds(tree, categoryId);
  const snapshotAt = new Date().toISOString();

  const tCategories = await getTranslations({ locale: DEFAULT_LOCALE, namespace: 'categories' });

  return (
    <div className="animate-fade-in space-y-5">
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
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/categories" className="transition-colors hover:text-foreground">
          {isRTL ? 'קטגוריות' : 'Categories'}
        </Link>
        {ancestors.map((ancestor) => (
          <span key={ancestor.id} className="flex items-center gap-1.5">
            <ChevronLeft className="h-3 w-3" />
            <Link href={`/categories/${ancestor.id}`} className="transition-colors hover:text-foreground">
              {categoryLabel(ancestor, locale)}
            </Link>
          </span>
        ))}
        <ChevronLeft className="h-3 w-3" />
        <span className="font-medium text-foreground">{name}</span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{name}</h1>
        {category.description && <p className="mt-1 text-sm text-muted-foreground">{category.description}</p>}
        <div className="mt-3">
          <PlayCategoryButton
            categoryId={category.id}
            scopeIds={scopeIds}
            snapshotAt={snapshotAt}
            rows={lessons}
          />
        </div>
      </div>

      {/* Subcategories, and theirs (if this category has any) */}
      {subcategories.length > 0 && <SubcategoryLinks nodes={subcategories} locale={locale} />}

      {/* Lessons */}
      {lessons.length > 0 ? (
        <LessonCardList>
          {lessons.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson} />
          ))}
        </LessonCardList>
      ) : subcategories.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={isRTL ? 'אין שיעורים בקטגוריה זו עדיין' : 'No lessons in this category yet'}
        />
      ) : null}
    </div>
  );
}
