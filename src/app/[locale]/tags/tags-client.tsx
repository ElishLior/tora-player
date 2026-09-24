'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Hash, Search } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { EmptyState } from '@/components/shared/empty-state';
import { matchTags, tagPath, tagWeight, type TagCount } from '@/lib/tag-links';

const WEIGHT_CLASSES = [
  'text-xs px-2.5 py-1',
  'text-sm px-3 py-1',
  'text-base px-3 py-1.5',
  'text-lg px-3.5 py-1.5 font-semibold',
  'text-xl px-4 py-2 font-bold',
];

interface TagsClientProps {
  tagCounts: TagCount[];
  loadFailed: boolean;
}

/** Tag cloud, most used first, sized by usage, filterable by a search box. */
export default function TagsClient({ tagCounts, loadFailed }: TagsClientProps) {
  const t = useTranslations('tagBrowse');
  const [query, setQuery] = useState('');
  const maxCount = tagCounts[0]?.lesson_count ?? 0;

  const visible = useMemo(() => {
    if (!query.trim()) return tagCounts;
    const matched = new Set(matchTags(tagCounts, query));
    return tagCounts.filter((row) => matched.has(row.tag));
  }, [query, tagCounts]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Hash className="h-5 w-5 text-primary" />
          {t('indexTitle')}
        </h1>
        <p className="text-xs text-muted-foreground">{t('indexSubtitle')}</p>
      </div>

      {tagCounts.length > 0 && (
        <div className="relative">
          <Search className="absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="w-full rounded-full border-0 bg-[hsl(var(--surface-elevated))] py-2.5 pe-4 ps-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      )}

      {loadFailed ? (
        <EmptyState icon={AlertTriangle} title={t('loadFailed')} />
      ) : tagCounts.length === 0 ? (
        <EmptyState icon={Hash} title={t('empty')} />
      ) : visible.length === 0 ? (
        <EmptyState icon={Search} title={t('noMatches')} />
      ) : (
        <ul className="flex flex-wrap items-center gap-2">
          {visible.map(({ tag, lesson_count }) => (
            <li key={tag}>
              <Link
                href={tagPath(tag)}
                aria-label={`#${tag}, ${t('lessonCount', { count: lesson_count })}`}
                className={`inline-flex items-baseline gap-1.5 rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20 ${
                  WEIGHT_CLASSES[tagWeight(lesson_count, maxCount)]
                }`}
              >
                <bdi>#{tag}</bdi>
                <span className="text-[0.7em] font-normal text-muted-foreground tabular-nums">{lesson_count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
