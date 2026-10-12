import { getTranslations } from 'next-intl/server';
import { ChevronLeft } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { SHORTS_CATEGORY_ID } from '@/lib/upload-drafts';
import { HomeSectionHeader } from '@/components/home/home-section-header';
import type { CategoryWithChildren } from '@/types/database';

/** Each category icon's dot colour (the same palette the category pages use). */
const DOT_CLASS: Record<string, string> = {
  BookOpen: 'bg-primary',
  Wrench: 'bg-blue-400',
  Sparkles: 'bg-purple-400',
  Music: 'bg-amber-400',
  Scissors: 'bg-rose-400',
};

interface CategoriesSectionProps {
  categories: CategoryWithChildren[];
  counts: Record<string, number>;
}

/** Categories as a quiet list: a coloured dot, the name, the lesson count. Each row links to the category. */
export async function CategoriesSection({ categories, counts }: CategoriesSectionProps) {
  if (categories.length === 0) return null;
  const t = await getTranslations('home');

  return (
    <section aria-labelledby="categories-title">
      <HomeSectionHeader id="categories-title" title={t('categories')} />
      <ul className="grid gap-0.5 rounded-2xl bg-[hsl(var(--surface-elevated))] p-1">
        {categories.map((category) => {
          const total =
            (counts[category.id] || 0) + category.children.reduce((sum, child) => sum + (counts[child.id] || 0), 0);
          const dot = DOT_CLASS[category.icon || ''] ?? 'bg-muted-foreground';
          return (
            <li key={category.id}>
              <Link
                href={category.id === SHORTS_CATEGORY_ID ? '/shorts' : `/categories/${category.id}`}
                className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold text-foreground transition-colors duration-150 hover:bg-[hsl(var(--surface-highlight))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none"
              >
                <span aria-hidden="true" className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${dot}`} />
                <span className="min-w-0 flex-1 truncate">{category.hebrew_name}</span>
                {total > 0 && <span className="text-[13px] tabular-nums text-muted-foreground">{total}</span>}
                <ChevronLeft aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-muted-foreground ltr:rotate-180" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
