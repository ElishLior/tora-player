export const dynamic = 'force-dynamic';

import { setRequestLocale } from 'next-intl/server';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { getCachedCategoriesTree, getCachedCategoryLessonTotals } from '@/lib/supabase/anon';
import { categoryLabel, categoryLessonTotal, childrenOf } from '@/lib/category-tree';
import { Link } from '@/i18n/routing';
import { ListLoadError } from '@/components/shared/list-load-error';
import { BookOpen, Wrench, Sparkles, Music, Scissors, FolderOpen, ChevronLeft } from 'lucide-react';
import type { CategoryWithChildren } from '@/types/database';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  BookOpen,
  Wrench,
  Sparkles,
  Music,
  Scissors,
};

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function CategoriesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isRTL = locale === 'he';

  let categories: CategoryWithChildren[] = [];
  let counts: Record<string, number> = {};
  let failed = false;

  if (isSupabaseConfigured()) {
    try {
      [categories, counts] = await Promise.all([getCachedCategoriesTree(), getCachedCategoryLessonTotals()]);
    } catch {
      failed = true;
    }
  }

  const emptyLabel = isRTL ? 'ריק' : 'Empty';

  /** A category and, nested under it, its subcategories (up to three levels). Each count is the whole branch. */
  function renderBranch(cat: CategoryWithChildren, depth: number) {
    const total = categoryLessonTotal(counts, cat.id);
    const children = childrenOf(categories, cat.id);
    const label = categoryLabel(cat, locale);
    const nested = children.length > 0 && (
      <div className="ms-6 space-y-0.5">{children.map((child) => renderBranch(child, depth + 1))}</div>
    );

    if (depth === 0) {
      const IconComponent = ICON_MAP[cat.icon || ''] || FolderOpen;
      return (
        <div key={cat.id} className="space-y-1">
          {/* Top-level category card */}
          <Link
            href={`/categories/${cat.id}`}
            className="flex items-center gap-3 rounded-xl bg-[hsl(var(--surface-elevated))] p-4 transition-colors hover:bg-[hsl(var(--surface-highlight))] focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/30 to-primary/10">
              <IconComponent className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-foreground">{label}</h2>
              {cat.description && <p className="truncate text-xs text-muted-foreground">{cat.description}</p>}
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <span className="text-xs text-muted-foreground">{total > 0 ? `${total}` : emptyLabel}</span>
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </div>
          </Link>
          {nested}
        </div>
      );
    }

    return (
      <div key={cat.id} className="space-y-0.5">
        <Link
          href={`/categories/${cat.id}`}
          className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-[hsl(var(--surface-highlight))] focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none"
        >
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-[hsl(var(--surface-elevated))]">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-medium text-foreground">{label}</h3>
          </div>
          <span className="flex-shrink-0 text-xs text-muted-foreground">{total > 0 ? `${total}` : emptyLabel}</span>
        </Link>
        {nested}
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <h1 className="text-2xl font-bold">{isRTL ? 'קטגוריות' : 'Categories'}</h1>

      {failed ? (
        <ListLoadError />
      ) : (
        // Top-level categories: one column on phones; two and three columns on wide screens (the pane, not the viewport).
        <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 xl:grid-cols-3">
          {categories.map((cat) => renderBranch(cat, 0))}
        </div>
      )}
    </div>
  );
}
