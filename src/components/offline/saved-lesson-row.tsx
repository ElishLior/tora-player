'use client';

import { useTranslations } from 'next-intl';
import { Play, Trash2 } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { lessonPath } from '@/config/site';
import { DateTile, LessonRow } from '@/components/lessons/lesson-row';
import { LessonPlayButton } from '@/components/lessons/lesson-play-button';
import { playTrack } from '@/lib/audio-controller';
import { getOfflineLessonTracks } from '@/lib/lesson-tracks';
import { playLesson } from '@/lib/play-lesson';
import { deleteDownloadedLesson, type OfflineAudioFileMeta, type OfflineLessonMeta } from '@/lib/offline-storage';
import { readingHue } from '@/lib/lesson-display';
import { formatFileSize } from '@/lib/audio-utils';
import { formatDuration } from '@/lib/utils';

/**
 * A lesson saved on this device, in the shared lesson row. Everything here is local (the
 * saved metadata and the blob files): no network read, so it works offline. The play button
 * continues the lesson; a saved file under it plays that file from its start, and the saved
 * files queue up either way.
 */
export function SavedLessonRow({ lesson }: { lesson: OfflineLessonMeta }) {
  const t = useTranslations('offline');
  const tPlayer = useTranslations('player');
  const tracks = getOfflineLessonTracks(lesson);
  const hue = readingHue(lesson.lessonId);
  const title = lesson.hebrewTitle || lesson.title;
  const files = [...lesson.audioFiles].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <LessonRow
      tile={<DateTile hue={hue} day={lesson.date.slice(8, 10)} month={lesson.date.slice(5, 7)} />}
      title={
        <Link
          href={lessonPath(lesson.lessonId)}
          dir="auto"
          className="line-clamp-2 before:absolute before:inset-0 before:content-[''] focus-visible:outline-none"
        >
          <bdi>{title}</bdi>
        </Link>
      }
      meta={
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted-foreground">
          <bdi dir="ltr" className="tabular-nums">
            {formatDuration(lesson.duration)}
          </bdi>
          <span aria-hidden="true">·</span>
          <bdi dir="ltr">{formatFileSize(lesson.fileSize)}</bdi>
          <span aria-hidden="true">·</span>
          <span>{t('filesCount', { count: lesson.audioFiles.length })}</span>
        </p>
      }
      actions={
        <div className="flex flex-shrink-0 items-center gap-1 self-center">
          <LessonPlayButton
            lessonId={lesson.lessonId}
            tracks={tracks}
            playLabel={t('play')}
            pauseLabel={tPlayer('pause')}
            className="h-11 w-11 bg-[hsl(var(--surface-highlight))] text-foreground hover:bg-primary hover:text-primary-foreground lg:[@media(hover:hover)]:group-hover/lesson:bg-primary lg:[@media(hover:hover)]:group-hover/lesson:text-[hsl(0_0%_7%)]"
            iconClassName="h-4 w-4 translate-x-[6%] fill-current"
          />
          <button
            type="button"
            onClick={() => void deleteDownloadedLesson(lesson.lessonId)}
            className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            aria-label={t('remove')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      }
      footer={
        files.length > 1 ? (
          <div className="space-y-1 border-t border-border/50 pt-2">
            {files.map((file, index) => (
              <SavedFileButton key={file.offlineKey} file={file} index={index} tracks={tracks} />
            ))}
          </div>
        ) : undefined
      }
    />
  );
}

/** One saved file of a multi-part lesson: plays that file (from its start) with the saved queue behind it. */
function SavedFileButton({
  file,
  index,
  tracks,
}: {
  file: OfflineAudioFileMeta;
  index: number;
  tracks: ReturnType<typeof getOfflineLessonTracks>;
}) {
  const t = useTranslations('offline');
  const label = file.originalName || file.title || t('part', { number: index + 1 });
  const play = () => {
    const at = tracks.findIndex((track) => track.offlineKey === file.offlineKey);
    if (at >= 0) playTrack(tracks[at], { queue: tracks, queueIndex: at });
    else playLesson(tracks);
  };
  return (
    <button
      type="button"
      onClick={play}
      className="relative z-10 flex w-full items-center gap-2 min-h-11 rounded-md px-2 py-1.5 text-start text-[13px] text-muted-foreground transition-colors hover:bg-[hsl(var(--surface-highlight))] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      aria-label={t('playFile')}
    >
      <Play aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0 fill-current" />
      <span className="flex-1 truncate">
        <bdi>{label}</bdi>
      </span>
      {file.duration > 0 && (
        <bdi dir="ltr" className="flex-shrink-0 tabular-nums">
          {formatDuration(file.duration)}
        </bdi>
      )}
    </button>
  );
}
