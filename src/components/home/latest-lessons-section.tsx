import { getTranslations } from 'next-intl/server';
import { generateLessonMetadata } from '@/lib/hebrew-date';
import { groupLessonsByWeek, type WeekGroup } from '@/lib/lesson-week-groups';
import { HomeSectionHeader } from '@/components/home/home-section-header';
import { LessonCard } from '@/components/lessons/lesson-card';
import { LessonCardList } from '@/components/lessons/lesson-card-list';
import type { LessonWithRelations } from '@/types/database';

interface LatestLessonsSectionProps {
  /** Lessons after the hero, newest first. */
  lessons: LessonWithRelations[];
  /** Today's date in Asia/Jerusalem (YYYY-MM-DD), computed on the server. */
  today: string;
  /** Layout hook: the home page's desktop order. */
  className?: string;
}

/**
 * "שיעורים אחרונים": the lessons grouped by week, each week headed by its label
 * ("השבוע", "שבוע שעבר" or its date range) and the week's reading when a lesson
 * carries one. Grouping and labels are computed here on the server, never on the client.
 */
export async function LatestLessonsSection({ lessons, today, className }: LatestLessonsSectionProps) {
  const t = await getTranslations('home');
  const groups = groupLessonsByWeek(lessons, today);
  if (groups.length === 0) return null;

  return (
    <section aria-labelledby="latest-lessons-title" className={className}>
      <HomeSectionHeader
        id="latest-lessons-title"
        title={t('recentLessons')}
        href="/lessons"
        linkLabel={t('allLessons')}
      />
      <div className="grid gap-5">
        {groups.map((group) => (
          <WeekBlock key={group.key} group={group} label={weekLabel(group, t)} reading={weekReading(group)} />
        ))}
      </div>
    </section>
  );
}

function weekLabel(group: WeekGroup<LessonWithRelations>, t: (key: 'thisWeek' | 'lastWeek') => string): string {
  if (group.kind === 'this-week') return t('thisWeek');
  if (group.kind === 'last-week') return t('lastWeek');
  return group.range;
}

/** The reading of the week, as the calendar names it ("פרשת נח", "חג הסוכות"). */
function weekReading(group: WeekGroup<LessonWithRelations>): string | null {
  if (!group.parsha) return null;
  return generateLessonMetadata(group.lessons[0].date).readingLabel;
}

function WeekBlock({
  group,
  label,
  reading,
}: {
  group: WeekGroup<LessonWithRelations>;
  label: string;
  reading: string | null;
}) {
  return (
    <div className="grid gap-1">
      <h3 className="flex items-baseline gap-2 px-1 text-sm font-bold text-foreground">
        <bdi dir="auto">{label}</bdi>
        {reading && <span className="font-medium text-muted-foreground">· {reading}</span>}
        <span aria-hidden="true" className="h-px flex-1 self-center bg-border/70" />
      </h3>
      {/* One column on phones and up to 1100px of pane; two and three columns on wide screens (see LessonCardList). */}
      <LessonCardList>
        {group.lessons.map((lesson) => (
          <LessonCard key={lesson.id} lesson={lesson} />
        ))}
      </LessonCardList>
    </div>
  );
}
