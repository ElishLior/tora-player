'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Pause, Play, Scissors, Search } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { EmptyState } from '@/components/shared/empty-state';
import { normalizeAudioUrl } from '@/lib/audio-url';
import { formatDuration } from '@/lib/utils';
import { tagPath } from '@/lib/tag-links';
import { useAudioStore, type AudioTrack } from '@/stores/audio-store';
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
  return [...counts.entries()]
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b, 'he'))
    .map(([tag]) => tag);
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

function toTrack(lesson: LessonWithRelations): AudioTrack {
  return {
    id: lesson.id,
    title: lesson.title,
    hebrewTitle: lesson.hebrew_title || lesson.title,
    audioUrl: normalizeAudioUrl(lesson.audio_url) || lesson.audio_url!,
    audioUrlFallback: normalizeAudioUrl(lesson.audio_url_fallback) || undefined,
    duration: lesson.duration,
    date: lesson.date,
    description: lesson.description || lesson.summary || undefined,
  };
}

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
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const setQueue = useAudioStore((s) => s.setQueue);

  // Topics that actually have lessons, in category order, "general" last.
  const topicTabs = useMemo(() => {
    const used = new Set(lessons.map((l) => topicOf(l, topics)));
    const tabs = topics.filter((tp) => used.has(tp.id)).map((tp) => ({ id: tp.id, label: tp.hebrew_name }));
    if (used.has(GENERAL)) tabs.push({ id: GENERAL, label: t('general') });
    return tabs;
  }, [lessons, topics, t]);

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
  const playable = visible.filter((lesson) => lesson.audio_url);

  const playFrom = (lesson: LessonWithRelations) => {
    if (currentTrack?.id === lesson.id) {
      togglePlay();
      return;
    }
    const start = playable.findIndex((l) => l.id === lesson.id);
    if (start >= 0) setQueue(playable.map(toTrack), start);
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

  const renderRow = (lesson: LessonWithRelations) => {
    const isCurrent = currentTrack?.id === lesson.id;
    const topicLabel = topicTabs.find((tab) => tab.id === topicOf(lesson, topics))?.label;
    return (
      <li key={lesson.id} className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-[hsl(var(--surface-highlight))] transition-colors">
        <button
          type="button"
          onClick={() => playFrom(lesson)}
          disabled={!lesson.audio_url}
          aria-label={isCurrent && isPlaying ? t('pause') : t('play')}
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-30 ${
            isCurrent ? 'bg-primary text-primary-foreground' : 'bg-[hsl(var(--surface-elevated))] text-foreground hover:bg-primary hover:text-primary-foreground'
          }`}
        >
          {isCurrent && isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ms-0.5" />}
        </button>
        <Link href={`/lessons/${lesson.id}`} className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold ${isCurrent ? 'text-primary' : ''}`} dir="auto">
            {lesson.hebrew_title || lesson.title}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {topicLabel && topicTabs.length > 1 && <span className="text-primary/80">{topicLabel} · </span>}
            {lesson.hebrew_date || <bdi>{lesson.date}</bdi>}
            {lesson.duration > 0 && (
              <>
                {' · '}
                <bdi>{formatDuration(lesson.duration)}</bdi>
              </>
            )}
          </p>
          {(lesson.tags?.length ?? 0) > 0 && (
            <p className="truncate text-xs text-primary/80">
              {lesson.tags.map((tg) => (
                <bdi key={tg} className="me-1.5">
                  #{tg}
                </bdi>
              ))}
            </p>
          )}
        </Link>
      </li>
    );
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Scissors className="h-5 w-5 text-rose-400" />
            {t('title')}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t('subtitle')} · {t('count', { count: lessons.length })}
          </p>
        </div>
        {playable.length > 0 && (
          <button
            type="button"
            onClick={() => setQueue(playable.map(toTrack), 0)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            <Play className="h-4 w-4" />
            {t('playAll')}
          </button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="w-full rounded-full border-0 bg-[hsl(var(--surface-elevated))] py-2.5 pe-4 ps-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {topicTabs.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {[{ id: null as string | null, label: t('all') }, ...topicTabs].map((tab) => (
            <button
              key={tab.id ?? 'all'}
              type="button"
              onClick={() => setTopic(tab.id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                topic === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-[hsl(var(--surface-elevated))] text-muted-foreground hover:text-foreground'
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
                    className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
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
        <div role="group" aria-label={tTags('groupBy')} className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">{tTags('groupBy')}:</span>
          {(['tag', 'category'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setGroupBy(mode)}
              aria-pressed={activeGroupBy === mode}
              className={`rounded-full px-2.5 py-1 transition-colors ${
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
        <EmptyState icon={AlertTriangle} title={tLessons('loadErrorTitle')} description={tLessons('loadErrorDescription')} />
      ) : visible.length === 0 ? (
        <EmptyState icon={Scissors} title={lessons.length === 0 ? t('empty') : t('noResults')} />
      ) : (
        groups.map((group) => (
          <section key={group.id} className="space-y-1">
            {group.tag ? (
              <h2 className="px-1 text-sm font-bold">
                <Link href={tagPath(group.tag)} className="text-primary hover:underline">
                  <bdi>{group.label}</bdi>
                </Link>
              </h2>
            ) : (
              group.label && <h2 className="px-1 text-sm font-bold text-muted-foreground">{group.label}</h2>
            )}
            <ul className="space-y-0.5">{group.lessons.map(renderRow)}</ul>
          </section>
        ))
      )}
    </div>
  );
}
