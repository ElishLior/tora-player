export const dynamic = 'force-dynamic';

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { getCachedCategoriesTree, getCachedCategoryLessonTotals } from '@/lib/supabase/anon';
import { ListLoadError } from '@/components/shared/list-load-error';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { CategoryTiles } from '@/components/categories/category-tiles';
import { FolderOpen } from 'lucide-react';
import type { CategoryWithChildren } from '@/types/database';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function CategoriesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('categories');

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

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title={t('title')} />

      {failed ? (
        <ListLoadError />
      ) : categories.length === 0 ? (
        <EmptyState icon={FolderOpen} title={t('noCategories')} />
      ) : (
        // Each top-level category is a tile with its colour dot; its subcategories are listed inside it.
        <CategoryTiles
          nodes={categories}
          tree={categories}
          counts={counts}
          locale={locale}
          emptyLabel={t('emptyCategory')}
          leading="dot"
        />
      )}
    </div>
  );
}
