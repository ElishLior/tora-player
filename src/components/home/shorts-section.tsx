import { getTranslations } from 'next-intl/server';
import { HomeSectionHeader } from '@/components/home/home-section-header';
import { ShortLessonRow } from '@/components/home/short-lesson-row';
import type { LessonWithRelations } from '@/types/database';

/** "קצרים": a quiet list after the lessons, one row per short clip. */
export async function ShortsSection({ lessons }: { lessons: LessonWithRelations[] }) {
  if (lessons.length === 0) return null;
  const t = await getTranslations('shorts');
  return (
    <section aria-labelledby="shorts-title">
      <HomeSectionHeader id="shorts-title" title={t('title')} href="/shorts" linkLabel={t('showAll')} />
      <ul className="grid gap-0.5">
        {lessons.map((lesson) => (
          <ShortLessonRow key={lesson.id} lesson={lesson} />
        ))}
      </ul>
    </section>
  );
}
