export const dynamic = 'force-dynamic';

import { setRequestLocale } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCategoriesTree, getCategoryLessonCounts } from '@/lib/supabase/queries';
import { Link } from '@/i18n/routing';
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

  const supabase = await createServerSupabaseClient();
  const isRTL = locale === 'he';

  let categories: CategoryWithChildren[] = [];
  let counts: Record<string, number> = {};

  if (supabase) {
    try {
      [categories, counts] = await Promise.all([
        getCategoriesTree(supabase),
        getCategoryLessonCounts(supabase),
      ]);
    } catch {
      // defaults
    }
  }

  // Calculate total count for parent categories (sum of children)
  function getTotalCount(cat: CategoryWithChildren): number {
    const own = counts[cat.id] || 0;
    const childTotal = cat.children.reduce((sum, c) => sum + (counts[c.id] || 0), 0);
    return own + childTotal;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">{isRTL ? 'קטגוריות' : 'Categories'}</h1>

      <div className="space-y-4">
        {categories.map((cat) => {
          const IconComponent = ICON_MAP[cat.icon || ''] || FolderOpen;
          const total = getTotalCount(cat);
          const hasChildren = cat.children.length > 0;

          return (
            <div key={cat.id} className="space-y-1">
              {/* Parent category card */}
              <Link
                href={`/categories/${cat.id}`}
                className="flex items-center gap-3 rounded-xl bg-[hsl(var(--surface-elevated))] p-4 hover:bg-[hsl(var(--surface-highlight))] transition-colors"
              >
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center flex-shrink-0">
                  <IconComponent className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-foreground">{cat.hebrew_name}</h2>
                  {cat.description && (
                    <p className="text-xs text-muted-foreground truncate">{cat.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {total > 0 ? `${total}` : (isRTL ? 'ריק' : 'Empty')}
                  </span>
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>

              {/* Child categories */}
              {hasChildren && (
                <div className="ms-6 space-y-0.5">
                  {cat.children.map((child) => {
                    const childCount = counts[child.id] || 0;
                    return (
                      <Link
                        key={child.id}
                        href={`/categories/${child.id}`}
                        className="flex items-center gap-3 rounded-lg p-3 hover:bg-[hsl(var(--surface-highlight))] transition-colors"
                      >
                        <div className="h-8 w-8 rounded-md bg-[hsl(var(--surface-elevated))] flex items-center justify-center flex-shrink-0">
                          <FolderOpen className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-foreground truncate">{child.hebrew_name}</h3>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {childCount > 0 ? `${childCount}` : (isRTL ? 'ריק' : 'Empty')}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
