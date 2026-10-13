'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, Play, Scissors } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { SearchField } from '@/components/shared/search-field';
import { CardGrid } from '@/components/shared/card-grid';
import { LessonCard } from '@/components/lessons/lesson-card';
import { playLessons } from '@/lib/play-lesson';
import { getLessonTracks } from '@/lib/lesson-tracks';
import { tagPath } from '@/lib/tag-links';
import { categoryLabel } from '@/lib/category-tree';
import { useAudioStore } from '@/stores/audio-store';
import type { Category, LessonWithRelations } from '@/types/database';

const GENERAL = 'general';
const UNTAGGED = 'untagged';

type GroupBy = 'tag' | 'category';

interface ShortsClientProps {
  lessons: LessonWithRelations[];
  topics: Category[];
  loadFailed: boolean;
  /** From `?tag=`; already normalized. */
  initialTag?: string;
}

/** Tags used by the shorts, most used first (ties alphabetical). */
function countTags(lessons: LessonWithRelations[]): string[] {
  const counts = new Map<string, number>();
  for (const lesson of lessons) for (const tag of lesson.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()].sort(([a, x], [b, y]) => y - x || a.localeCompare(b, 'he')).map(([tag]) => tag);
}

/** Keep `?tag=` in the address bar in sync without a navigation. */
function syncTagParam(tag: string | null) {
  const url = new URL(window.location.href);
  if (tag) url.searchParams.set('tag', tag);
  else url.searchParams.delete('tag');
  window.history.replaceState(window.history.state, '', url);
}

/** Topic id of a short: its קצרים sub-category, or "general". */
function topicOf(lesson: LessonWithRelations, topics: Category[]): string {
  return topics.some((tp) => tp.id === lesson.category_id) ? lesson.category_id! : GENERAL;
}

/** A filter chip (topic or tag group): the same shape as the /lessons filters. */
const CHIP =
  'whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';

export default function ShortsClient({ lessons, topics, loadFailed, initialTag }: ShortsClientProps) {
  const t = useTranslations('shorts');
  const tLessons = useTranslations('lessons');
  const tTags = useTranslations('tagBrowse');
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<string | null>(null);
  const [tag, setTagState] = useState<string | null>(initialTag ?? null);
  const tagTabs = useMemo(() => countTags(lessons), [lessons]);
  const [groupBy, setGroupBy] = useState<GroupBy>(tagTabs.length > 0 ? 'tag' : 'category');
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const locale = useLocale();

  // Topics that actually have lessons, in category order, "general" last.
  const topicTabs = useMemo(() => {
    const used = new Set(lessons.map((l) => topicOf(l, topics)));
    const tabs = topics.filter((tp) => used.has(tp.id)).map((tp) => ({ id: tp.id, label: categoryLabel(tp, locale) }));
    if (used.has(GENERAL)) tabs.push({ id: GENERAL, label: t('general') });
    return tabs;
  }, [lessons, topics, t, locale]);

  // An unknown ?tag= stays visible so it can be cleared.
  const tagChips = tag && !tagTabs.includes(tag) ? [tag, ...tagTabs] : tagTabs;

  const setTag = (next: string | null) => {
    setTagState(next);
    syncTagParam(next);
  };

  const needle = query.trim().replace(/^#+/, '').toLowerCase();
  const visible = lessons.filter(
    (lesson) =>
      (!topic || topicOf(lesson, topics) === topic) &&
      (!tag || (lesson.tags ?? []).includes(tag)) &&
      (!needle ||
        [lesson.title, lesson.hebrew_title, lesson.description, lesson.summary, ...(lesson.tags ?? [])].some((field) =>
          field?.toLowerCase().includes(needle),
        )),
  );
  const playable = visible.filter((lesson) => lesson.audio_url || lesson.audio_files?.length);

  // A row's play button queues the visible playable shorts from that row on.
  const playFrom = (lesson: LessonWithRelations) => {
    if (currentTrack?.id === lesson.id) {
      togglePlay();
      return;
    }
    const start = playable.findIndex((l) => l.id === lesson.id);
    if (start >= 0) playLessons(playable.map(getLessonTracks), start);
  };

  // Group only when browsing everything: by tag (a short sits under each of its
  // tags) or by קצרים sub-category when there is more than one.
  const browsingAll = !topic && !tag && !needle;
  const canGroupByCategory = topicTabs.length > 1;
  const canGroupByTag = tagTabs.length > 0;
  const activeGroupBy: GroupBy | null =
    groupBy === 'tag' && canGroupByTag ? 'tag' : canGroupByCategory ? 'category' : canGroupByTag ? 'tag' : null;

  type Group = { id: string; label: string | null; tag?: string; lessons: LessonWithRelations[] };
  let groups: Group[] = [{ id: 'all', label: null, lessons: visible }];
  if (browsingAll && activeGroupBy === 'category') {
    groups = topicTabs.map((tab) => ({ ...tab, lessons: visible.filter((l) => topicOf(l, topics) === tab.id) }));
  } else if (browsingAll && activeGroupBy === 'tag') {
    groups = tagTabs.map((tg) => ({
      id: `tag-${tg}`,
      label: `#${tg}`,
      tag: tg,
      lessons: visible.filter((l) => (l.tags ?? []).includes(tg)),
    }));
    const untagged = visible.filter((l) => !l.tags?.length);
    if (untagged.length > 0) groups.push({ id: UNTAGGED, label: tTags('untagged'), lessons: untagged });
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        icon={Scissors}
        iconClassName="text-rose-400"
        title={t('title')}
        subtitle={`${t('subtitle')} · ${t('count', { count: lessons.length })}`}
        actions={
          playable.length > 0 && (
            <button
              type="button"
              onClick={() => playLessons(playable.map(getLessonTracks))}
              className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <Play className="h-4 w-4 fill-current" />
              {t('playAll')}
            </button>
          )
        }
      />

      <SearchField value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchPlaceholder')} />

      {topicTabs.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {[{ id: null as string | null, label: t('all') }, ...topicTabs].map((tab) => (
            <button
              key={tab.id ?? 'all'}
              type="button"
              onClick={() => setTopic(tab.id)}
              aria-pressed={topic === tab.id}
              className={`${CHIP} ${
                topic === tab.id
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-transparent bg-[hsl(var(--surface-elevated))] text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {tagChips.length > 0 && (
        <nav
          aria-label={tTags('filterLabel')}
          className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:overflow-visible md:px-0"
        >
          <ul className="flex w-max gap-2 pb-1 md:w-auto md:flex-wrap">
            {tagChips.map((tg) => {
              const active = tag === tg;
              return (
                <li key={tg}>
                  <button
                    type="button"
                    onClick={() => setTag(active ? null : tg)}
                    aria-pressed={active}
                    className={`${CHIP} ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-primary/30 text-primary hover:bg-primary/10'
                    }`}
                  >
                    <bdi>#{tg}</bdi>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {browsingAll && canGroupByCategory && canGroupByTag && visible.length > 0 && (
        <div role="group" aria-label={tTags('groupBy')} className="flex items-center gap-1 text-[13px]">
          <span className="text-muted-foreground">{tTags('groupBy')}:</span>
          {(['tag', 'category'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setGroupBy(mode)}
              aria-pressed={activeGroupBy === mode}
              className={`rounded-full px-2.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                activeGroupBy === mode
                  ? 'bg-[hsl(var(--surface-highlight))] font-bold text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {mode === 'tag' ? tTags('groupByTag') : tTags('groupByCategory')}
            </button>
          ))}
        </div>
      )}

      {loadFailed ? (
        <EmptyState
          icon={AlertTriangle}
          title={tLessons('loadErrorTitle')}
          description={tLessons('loadErrorDescription')}
        />
      ) : visible.length === 0 ? (
        <EmptyState tone="rose" icon={Scissors} title={lessons.length === 0 ? t('empty') : t('noResults')} />
      ) : (
        groups.map((group) => (
          <section key={group.id} className="space-y-2">
            {group.tag ? (
              <h2 className="flex items-baseline gap-2 px-1 text-sm font-bold">
                <Link
                  href={tagPath(group.tag)}
                  className="inline-flex min-h-7 max-w-full items-center rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <bdi>{group.label}</bdi>
                </Link>
                <span aria-hidden="true" className="h-px flex-1 self-center bg-border/70" />
              </h2>
            ) : (
              group.label && (
                <h2 className="flex items-baseline gap-2 px-1 text-sm font-bold text-muted-foreground">
                  {group.label}
                  <span aria-hidden="true" className="h-px flex-1 self-center bg-border/70" />
                </h2>
              )
            )}
            <CardGrid variant="rows">
              {group.lessons.map((lesson) => (
                <LessonCard key={lesson.id} lesson={lesson} variant="short" onStart={() => playFrom(lesson)} />
              ))}
            </CardGrid>
          </section>
        ))
      )}
    </div>
  );
}
