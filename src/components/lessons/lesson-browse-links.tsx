import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { seriesPath } from '@/config/site';
import { lessonsHref, tagPath } from '@/lib/tag-links';
import { cn } from '@/lib/utils';

const focusClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50';

/**
 * Sibling of the lesson link, including on cards with a stretched title link.
 * `children` replaces the visible date (a styled tile); the accessible name stays the full date.
 */
export function LessonDateLink({
  date,
  hebrewDate,
  onClick,
  className,
  children,
}: {
  date: string;
  hebrewDate?: string | null;
  /** E.g. closing the full player, so the list it opens is visible. */
  onClick?: () => void;
  /** Size or colour override for the surrounding row (merged with the default text-xs). */
  className?: string;
  children?: React.ReactNode;
}) {
  const t = useTranslations('lessonBrowse');
  const label = hebrewDate || date.split('-').reverse().join('.');
  return (
    <Link
      href={lessonsHref({ date })}
      onClick={onClick}
      aria-label={t('dateLink', { date: `${label} (${date})` })}
      data-lesson-date={date}
      className={cn(
        `relative z-10 inline-flex min-h-7 max-w-full items-center rounded px-0.5 text-xs text-muted-foreground hover:text-primary hover:underline ${focusClass}`,
        className,
      )}
    >
      {children ?? <bdi className="min-w-0 break-words">{label}</bdi>}
    </Link>
  );
}

/** A lesson's series name, linking to the series page. Sibling of the lesson link, never nested. Colour comes from `className`. */
export function LessonSeriesLink({
  seriesId,
  name,
  onClick,
  className = '',
}: {
  seriesId: string;
  name: string;
  /** E.g. closing the full player, so the series page it opens is visible. */
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Link
      href={seriesPath(seriesId)}
      onClick={onClick}
      data-lesson-series={seriesId}
      dir="auto"
      className={`relative z-10 inline-block max-w-full truncate rounded-sm hover:underline ${focusClass} ${className}`}
    >
      {name}
    </Link>
  );
}

export function LessonTagLink({ tag }: { tag: string }) {
  const t = useTranslations('lessonBrowse');
  return (
    <Link
      href={tagPath(tag)}
      aria-label={t('tagLink', { tag })}
      data-lesson-tag={tag}
      className={`relative z-10 inline-flex min-h-7 max-w-full items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 ${focusClass}`}
    >
      <bdi className="min-w-0 break-words">#{tag}</bdi>
    </Link>
  );
}

/** A lesson's tag chips on one wrapping row. Renders nothing without tags. */
export function LessonTagList({ tags }: { tags: readonly string[] | null | undefined }) {
  if (!tags?.length) return null;
  return (
    <ul className="mt-1 flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <li key={tag} className="max-w-full">
          <LessonTagLink tag={tag} />
        </li>
      ))}
    </ul>
  );
}
