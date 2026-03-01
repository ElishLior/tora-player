export const dynamic = 'force-dynamic';

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRecentLessons, getCategoriesTree, getCategoryLessonCounts } from '@/lib/supabase/queries';
import { LessonCard } from '@/components/lessons/lesson-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Link } from '@/i18n/routing';
import { BookOpen, Wrench, Sparkles, Music, Scissors, FolderOpen, Plus, ChevronLeft } from 'lucide-react';
import { isAdmin } from '@/actions/auth';
import { ContinueListeningSection } from '@/components/home/continue-listening-section';
import type { CategoryWithChildren } from '@/types/database';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  BookOpen,
  Wrench,
  Sparkles,
  Music,
  Scissors,
};

const COLOR_MAP: Record<string, string> = {
  BookOpen: 'from-primary/40 to-primary/20',
  Wrench: 'from-blue-500/40 to-blue-500/20',
  Sparkles: 'from-purple-500/40 to-purple-500/20',
  Music: 'from-amber-500/40 to-amber-500/20',
  Scissors: 'from-rose-500/40 to-rose-500/20',
};

const TEXT_COLOR_MAP: Record<string, string> = {
  BookOpen: 'text-primary',
  Wrench: 'text-blue-400',
  Sparkles: 'text-purple-400',
  Music: 'text-amber-400',
  Scissors: 'text-rose-400',
};

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');

  const supabase = await createServerSupabaseClient();
  const admin = await isAdmin();

  let recentLessons: Awaited<ReturnType<typeof getRecentLessons>> = [];
  let categories: CategoryWithChildren[] = [];
  let counts: Record<string, number> = {};

  if (supabase) {
    try {
      [recentLessons, categories, counts] = await Promise.all([
        getRecentLessons(supabase, 10),
        getCategoriesTree(supabase),
        getCategoryLessonCounts(supabase),
      ]);
    } catch {
      // defaults already set
    }
  }

  const isRTL = locale === 'he';

  function getTotalCount(cat: CategoryWithChildren): number {
    const own = counts[cat.id] || 0;
    const childTotal = cat.children.reduce((sum, c) => sum + (counts[c.id] || 0), 0);
    return own + childTotal;
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Greeting - Spotify style */}
      <section className="pt-2">
        <h1 className="text-2xl font-bold text-foreground">{t('welcome')}</h1>
      </section>

      {/* Categories grid */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">{isRTL ? 'קטגוריות' : 'Categories'}</h2>
          <Link
            href="/categories"
            className="flex items-center gap-0.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            {isRTL ? 'הצג הכל' : 'Show all'}
            <ChevronLeft className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {categories.map((cat) => {
            const IconComponent = ICON_MAP[cat.icon || ''] || FolderOpen;
            const gradient = COLOR_MAP[cat.icon || ''] || 'from-gray-500/40 to-gray-500/20';
            const textColor = TEXT_COLOR_MAP[cat.icon || ''] || 'text-muted-foreground';
            const total = getTotalCount(cat);

            return (
              <Link
                key={cat.id}
                href={`/categories/${cat.id}`}
                className="flex items-center gap-3 rounded-md bg-[hsl(var(--surface-elevated))] p-3 hover:bg-[hsl(var(--surface-highlight))] transition-colors"
              >
                <div className={`h-8 w-8 rounded bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                  <IconComponent className={`h-4 w-4 ${textColor}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-semibold block truncate">{cat.hebrew_name}</span>
                  {total > 0 && (
                    <span className="text-[10px] text-muted-foreground">{total}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Continue Listening — client-side, reads from localStorage per device */}
      <ContinueListeningSection title={t('continueListening')} />

      {/* Recent Lessons */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">{t('recentLessons')}</h2>
          <div className="flex items-center gap-2">
            <Link
              href="/lessons"
              className="flex items-center gap-0.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              {isRTL ? 'הצג הכל' : 'Show all'}
              <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
            {admin && (
              <Link
                href="/lessons/upload"
                className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 hover:scale-105 transition-all"
              >
                <Plus className="h-3.5 w-3.5" />
                {isRTL ? 'הוסף' : 'Add'}
              </Link>
            )}
          </div>
        </div>
        {recentLessons.length > 0 ? (
          <div className="space-y-0.5">
            {recentLessons.map((lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={BookOpen}
            title={isRTL ? 'אין שיעורים עדיין' : 'No lessons yet'}
            description={isRTL ? (admin ? 'הוסף שיעור ראשון כדי להתחיל' : 'שיעורים יתווספו בקרוב') : (admin ? 'Add your first lesson to get started' : 'Lessons will be added soon')}
            action={
              admin ? (
                <Link
                  href="/lessons/upload"
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 hover:scale-105 transition-all"
                >
                  {isRTL ? 'הוספת שיעור' : 'Add Lesson'}
                </Link>
              ) : undefined
            }
          />
        )}
      </section>
    </div>
  );
}
