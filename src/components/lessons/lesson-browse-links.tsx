import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { lessonsHref, tagPath } from '@/lib/tag-links';

const focusClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50';

/** Sibling of the lesson link, including on cards with a stretched title link. */
export function LessonDateLink({
  date,
  hebrewDate,
  onClick,
}: {
  date: string;
  hebrewDate?: string | null;
  /** E.g. closing the full player, so the list it opens is visible. */
  onClick?: () => void;
}) {
  const t = useTranslations('lessonBrowse');
  const label = hebrewDate || date.split('-').reverse().join('.');
  return (
    <Link
      href={lessonsHref({ date })}
      onClick={onClick}
      aria-label={t('dateLink', { date: `${label} (${date})` })}
      data-lesson-date={date}
      className={`relative z-10 inline-flex min-h-7 max-w-full items-center rounded px-0.5 text-xs text-muted-foreground hover:text-primary hover:underline ${focusClass}`}
    >
      <bdi className="min-w-0 break-words">{label}</bdi>
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
