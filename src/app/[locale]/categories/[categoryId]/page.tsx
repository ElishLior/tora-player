export const dynamic = 'force-dynamic';

import { cache } from 'react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { getCachedAllCategories, getCachedCategoryById, getCachedCategoryLessons } from '@/lib/supabase/anon';
import { LessonCard } from '@/components/lessons/lesson-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Link } from '@/i18n/routing';
import { BookOpen, ChevronLeft, FolderOpen } from 'lucide-react';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/json-ld';
import { DEFAULT_LOCALE, SITE_NAME, SITE_TAGLINE, categoryPath } from '@/config/site';
import { breadcrumbJsonLd, pageAlternates, truncateText } from '@/lib/seo';

type Props = {
  params: Promise<{ locale: string; categoryId: string }>;
};

/** One category lookup per request, shared by generateMetadata and the page. */
const loadCategory = cache((categoryId: string) => getCachedCategoryById(categoryId).catch(() => null));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categoryId } = await params;
  const category = await loadCategory(categoryId);
  if (!category) return {};
  return {
    title: category.hebrew_name,
    description: truncateText(category.description || `${category.hebrew_name} — ${SITE_TAGLINE.he}`),
    alternates: pageAlternates(categoryPath(category.id)),
  };
}

export default async function CategoryDetailPage({ params }: Props) {
  const { locale, categoryId } = await params;
  setRequestLocale(locale);

  const isRTL = locale === 'he';

  if (!isSupabaseConfigured()) return notFound();

  const category = await loadCategory(categoryId);
  if (!category) return notFound();

  // Get all categories to find parent name and sibling sub-categories
  const allCategories = await getCachedAllCategories();
  const parentCategory = category.parent_id
    ? allCategories.find(c => c.id === category.parent_id) || null
    : null;
  const childCategories = allCategories
    .filter(c => c.parent_id === categoryId)
    .sort((a, b) => a.sort_order - b.sort_order);

  const lessons = await getCachedCategoryLessons(categoryId);

  const tCategories = await getTranslations({ locale: DEFAULT_LOCALE, namespace: 'categories' });

  return (
    <div className="space-y-5 animate-fade-in">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: SITE_NAME.he, pathname: '/' },
          { name: tCategories('title'), pathname: '/categories' },
          ...(parentCategory ? [{ name: parentCategory.hebrew_name, pathname: categoryPath(parentCategory.id) }] : []),
          { name: category.hebrew_name, pathname: categoryPath(category.id) },
        ])}
      />
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/categories" className="hover:text-foreground transition-colors">
          {isRTL ? 'קטגוריות' : 'Categories'}
        </Link>
        {parentCategory && (
          <>
            <ChevronLeft className="h-3 w-3" />
            <Link href={`/categories/${parentCategory.id}`} className="hover:text-foreground transition-colors">
              {parentCategory.hebrew_name}
            </Link>
          </>
        )}
        <ChevronLeft className="h-3 w-3" />
        <span className="text-foreground font-medium">{category.hebrew_name}</span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{category.hebrew_name}</h1>
        {category.description && (
          <p className="text-sm text-muted-foreground mt-1">{category.description}</p>
        )}
      </div>

      {/* Sub-categories (if this is a parent) */}
      {childCategories.length > 0 && (
        <div className="space-y-1">
          {childCategories.map((child) => (
            <Link
              key={child.id}
              href={`/categories/${child.id}`}
              className="flex items-center gap-3 rounded-lg bg-[hsl(var(--surface-elevated))] p-3 hover:bg-[hsl(var(--surface-highlight))] transition-colors"
            >
              <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <FolderOpen className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-medium flex-1">{child.hebrew_name}</span>
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}

      {/* Lessons */}
      {lessons.length > 0 ? (
        <div className="space-y-0.5">
          {lessons.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson} showProgress />
          ))}
        </div>
      ) : childCategories.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={isRTL ? 'אין שיעורים בקטגוריה זו עדיין' : 'No lessons in this category yet'}
        />
      ) : null}
    </div>
  );
}
