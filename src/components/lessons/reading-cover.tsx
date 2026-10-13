import { hebrewDayMonth, readingHue } from '@/lib/lesson-display';
import { parshaLabel } from '@/lib/parsha-label';
import { cn } from '@/lib/utils';

interface ReadingCoverLesson {
  id: string;
  parsha?: string | null;
  hebrew_date?: string | null;
  date: string;
}

/** The text and hue a lesson's cover shows: its reading, or the day when it has none. */
export function readingCoverOf(lesson: ReadingCoverLesson): { text: string; hue: number } {
  const reading = lesson.parsha ? parshaLabel(lesson.parsha) : null;
  return {
    text: reading ?? hebrewDayMonth(lesson.hebrew_date)?.day ?? lesson.date.slice(8, 10),
    hue: readingHue(lesson.parsha || lesson.id),
  };
}

/**
 * The lesson's cover (concept B): its reading name on a gradient in the reading's hue,
 * the same colour family as the row date tiles. Decorative; size it with `className`.
 */
export function ReadingCover({
  lesson,
  className,
  textClassName,
}: {
  lesson: ReadingCoverLesson;
  className?: string;
  textClassName?: string;
}) {
  const { text, hue } = readingCoverOf(lesson);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid flex-shrink-0 place-items-center overflow-hidden rounded-2xl p-2 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.7)]',
        className,
      )}
      style={{ background: `linear-gradient(150deg, hsl(${hue} 45% 34%), hsl(${hue} 30% 14%))` }}
    >
      <b
        className={cn('line-clamp-3 text-center font-extrabold leading-tight', textClassName)}
        style={{ color: `hsl(${hue} 75% 84%)` }}
      >
        {text}
      </b>
    </span>
  );
}
