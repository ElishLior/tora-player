'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Hash, Search } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { SearchField } from '@/components/shared/search-field';
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
    <div className="animate-fade-in space-y-6">
      <PageHeader icon={Hash} iconClassName="text-primary" title={t('indexTitle')} subtitle={t('indexSubtitle')} />

      {tagCounts.length > 0 && (
        <SearchField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
        />
      )}

      {loadFailed ? (
        <EmptyState icon={AlertTriangle} title={t('loadFailed')} />
      ) : tagCounts.length === 0 ? (
        <EmptyState icon={Hash} title={t('empty')} />
      ) : visible.length === 0 ? (
        <EmptyState icon={Search} title={t('noMatches')} />
      ) : (
        <div className="rounded-2xl bg-[hsl(var(--surface-elevated))] p-4 sm:p-6">
          <ul className="flex flex-wrap items-center gap-2.5">
            {visible.map(({ tag, lesson_count }) => (
              <li key={tag}>
                <Link
                  href={tagPath(tag)}
                  aria-label={`#${tag}, ${t('lessonCount', { count: lesson_count })}`}
                  className={`inline-flex items-baseline gap-1.5 rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                    WEIGHT_CLASSES[tagWeight(lesson_count, maxCount)]
                  }`}
                >
                  <bdi>#{tag}</bdi>
                  <span className="text-[0.7em] font-normal tabular-nums text-muted-foreground">{lesson_count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
