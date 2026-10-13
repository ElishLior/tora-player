import { getTranslations } from 'next-intl/server';
import { HomeSectionHeader } from '@/components/home/home-section-header';
import { LessonCard } from '@/components/lessons/lesson-card';
import type { LessonWithRelations } from '@/types/database';

/** "קצרים": a quiet list after the lessons, one shared short row (`LessonCard variant="short"`) per clip. */
export async function ShortsSection({ lessons }: { lessons: LessonWithRelations[] }) {
  if (lessons.length === 0) return null;
  const t = await getTranslations('shorts');
  return (
    <section aria-labelledby="shorts-title">
      <HomeSectionHeader id="shorts-title" title={t('title')} href="/shorts" linkLabel={t('showAll')} />
      <ul className="grid gap-0.5">
        {lessons.map((lesson) => (
          <li key={lesson.id}>
            <LessonCard lesson={lesson} variant="short" />
          </li>
        ))}
      </ul>
    </section>
  );
}
