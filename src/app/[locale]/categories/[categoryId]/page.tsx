export const dynamic = 'force-dynamic';

import { setRequestLocale } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCategoryById, getLessonsByCategory, getAllCategories } from '@/lib/supabase/queries';
import { LessonCard } from '@/components/lessons/lesson-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Link } from '@/i18n/routing';
import { BookOpen, ChevronLeft, FolderOpen } from 'lucide-react';
import { notFound } from 'next/navigation';
import type { Category } from '@/types/database';

type Props = {
  params: Promise<{ locale: string; categoryId: string }>;
};

export default async function CategoryDetailPage({ params }: Props) {
  const { locale, categoryId } = await params;
  setRequestLocale(locale);

  const supabase = await createServerSupabaseClient();
  const isRTL = locale === 'he';

  if (!supabase) return notFound();

  let category: Category;
  try {
    category = await getCategoryById(supabase, categoryId);
  } catch {
    return notFound();
  }

  // Get all categories to find parent name and sibling sub-categories
  const allCategories = await getAllCategories(supabase);
  const parentCategory = category.parent_id
    ? allCategories.find(c => c.id === category.parent_id) || null
    : null;
  const childCategories = allCategories
    .filter(c => c.parent_id === categoryId)
    .sort((a, b) => a.sort_order - b.sort_order);

  const lessons = await getLessonsByCategory(supabase, categoryId);

  return (
    <div className="space-y-5 animate-fade-in">
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
